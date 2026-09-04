package com.gradelens.omr

import android.content.Context
import android.net.Uri
import org.opencv.core.Core
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.MatOfPoint
import org.opencv.core.Rect
import org.opencv.core.Size
import org.opencv.imgcodecs.Imgcodecs
import org.opencv.imgproc.Imgproc
import org.tensorflow.lite.Interpreter
import java.io.File
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

data class StudentIdDigitResult(
    val position: Int,
    val digit: Int,
    val confidence: Float,
    val cropUri: String,
    val binaryUri: String,
    val modelInputUri: String
)

data class StudentIdRecognitionResult(
    val success: Boolean,
    val studentId: String,
    val digits: List<StudentIdDigitResult>,
    val minConfidence: Float,
    val averageConfidence: Float,
    val weakPositions: List<Int>
)

class StudentIdRecognizer(
    private val context: Context
) : AutoCloseable {

    companion object {
        private const val MODEL_ASSET_NAME =
            "best_id_recognizer.tflite"

        private const val NORMALIZED_WIDTH =
            2480

        private const val NORMALIZED_HEIGHT =
            3508

        private const val SHEET_WIDTH_MM =
            148.5

        private const val SHEET_HEIGHT_MM =
            210.0

        private const val STUDENT_ID_BOX_START_X_MM =
            28.0

        private const val STUDENT_ID_BOX_Y_MM =
            25.4

        private const val STUDENT_ID_BOX_SIZE_MM =
            5.0

        private const val STUDENT_ID_BOX_GAP_MM =
            1.0

        private const val STUDENT_ID_DIGITS =
            6

        private const val STUDENT_ID_INNER_MARGIN_MM =
            0.55

        private const val TARGET_DIGIT_SIZE =
            20

        private const val MODEL_SIZE =
            28

        /*
         * Debug checkpoint only:
         * anything below this confidence is considered weak.
         * We are not using this to reject permanently yet.
         */
        private const val WEAK_CONFIDENCE_THRESHOLD =
            0.80f
    }

    private val interpreter: Interpreter =
        Interpreter(
            loadModelFile(),
            Interpreter.Options().apply {
                setNumThreads(2)
            }
        )

    private fun loadModelFile(): ByteBuffer {
        context.assets.openFd(
            MODEL_ASSET_NAME
        ).use { fileDescriptor ->

            FileInputStream(
                fileDescriptor.fileDescriptor
            ).channel.use { fileChannel ->

                return fileChannel.map(
                    FileChannel.MapMode.READ_ONLY,
                    fileDescriptor.startOffset,
                    fileDescriptor.declaredLength
                )
            }
        }
    }

    private fun mmToX(
        mm: Double
    ): Double {
        return (
            mm *
                NORMALIZED_WIDTH /
                SHEET_WIDTH_MM
            )
    }

    private fun mmToY(
        mm: Double
    ): Double {
        return (
            mm *
                NORMALIZED_HEIGHT /
                SHEET_HEIGHT_MM
            )
    }

    private fun saveDebugMat(
        mat: Mat,
        fileName: String
    ): String {

        val dir =
            File(
                context.cacheDir,
                "gradelens/student_id_debug"
            )

        if (
            !dir.exists()
        ) {
            dir.mkdirs()
        }

        val file =
            File(
                dir,
                fileName
            )

        val saved =
            Imgcodecs.imwrite(
                file.absolutePath,
                mat
            )

        if (
            !saved
        ) {
            throw IllegalStateException(
                "Could not save student ID debug image: $fileName"
            )
        }

        return Uri.fromFile(
            file
        ).toString()
    }

    private fun getStudentIdCrop(
        normalizedImage: Mat,
        index: Int
    ): Mat {

        require(
            index in 0 until
                STUDENT_ID_DIGITS
        ) {
            "Student ID digit index must be 0..5."
        }

        val xMm =
            STUDENT_ID_BOX_START_X_MM +
                index *
                (
                    STUDENT_ID_BOX_SIZE_MM +
                        STUDENT_ID_BOX_GAP_MM
                    )

        val yMm =
            STUDENT_ID_BOX_Y_MM

        val x1 =
            mmToX(
                xMm +
                    STUDENT_ID_INNER_MARGIN_MM
            )
                .roundToInt()
                .coerceIn(
                    0,
                    normalizedImage.cols() - 1
                )

        val y1 =
            mmToY(
                yMm +
                    STUDENT_ID_INNER_MARGIN_MM
            )
                .roundToInt()
                .coerceIn(
                    0,
                    normalizedImage.rows() - 1
                )

        val x2 =
            mmToX(
                xMm +
                    STUDENT_ID_BOX_SIZE_MM -
                    STUDENT_ID_INNER_MARGIN_MM
            )
                .roundToInt()
                .coerceIn(
                    x1 + 1,
                    normalizedImage.cols()
                )

        val y2 =
            mmToY(
                yMm +
                    STUDENT_ID_BOX_SIZE_MM -
                    STUDENT_ID_INNER_MARGIN_MM
            )
                .roundToInt()
                .coerceIn(
                    y1 + 1,
                    normalizedImage.rows()
                )

        return normalizedImage.submat(
            Rect(
                x1,
                y1,
                x2 - x1,
                y2 - y1
            )
        ).clone()
    }

    private data class PreprocessDebugResult(
        val input: FloatArray,
        val binary: Mat,
        val modelInputImage: Mat
    )

    private fun preprocessDigit(
        crop: Mat
    ): PreprocessDebugResult {

        val gray =
            Mat()

        val binary =
            Mat()

        try {
            Imgproc.cvtColor(
                crop,
                gray,
                Imgproc.COLOR_BGR2GRAY
            )

            Imgproc.threshold(
                gray,
                binary,
                0.0,
                255.0,
                Imgproc.THRESH_BINARY_INV or
                    Imgproc.THRESH_OTSU
            )

            val contours =
                mutableListOf<MatOfPoint>()

            val hierarchy =
                Mat()

            try {
                Imgproc.findContours(
                    binary.clone(),
                    contours,
                    hierarchy,
                    Imgproc.RETR_EXTERNAL,
                    Imgproc.CHAIN_APPROX_SIMPLE
                )
            } finally {
                hierarchy.release()
            }

            val validContours =
                contours.filter {
                    Imgproc.contourArea(it) >=
                        3.0
                }

            val digitMat =
                if (
                    validContours.isNotEmpty()
                ) {
                    val allPoints =
                        mutableListOf<org.opencv.core.Point>()

                    validContours.forEach {
                        allPoints.addAll(
                            it.toList()
                        )
                    }

                    val pointsMat =
                        MatOfPoint()

                    try {
                        pointsMat.fromList(
                            allPoints
                        )

                        val rect =
                            Imgproc.boundingRect(
                                pointsMat
                            )

                        binary.submat(
                            rect
                        ).clone()

                    } finally {
                        pointsMat.release()
                        contours.forEach {
                            it.release()
                        }
                    }
                } else {
                    contours.forEach {
                        it.release()
                    }

                    binary.clone()
                }

            try {
                val width =
                    max(
                        digitMat.cols(),
                        1
                    )

                val height =
                    max(
                        digitMat.rows(),
                        1
                    )

                val scale =
                    min(
                        TARGET_DIGIT_SIZE.toDouble() /
                            width,

                        TARGET_DIGIT_SIZE.toDouble() /
                            height
                    )

                val resizedWidth =
                    max(
                        1,
                        (
                            width *
                                scale
                            )
                            .roundToInt()
                    )

                val resizedHeight =
                    max(
                        1,
                        (
                            height *
                                scale
                            )
                            .roundToInt()
                    )

                val resized =
                    Mat()

                try {
                    Imgproc.resize(
                        digitMat,
                        resized,
                        Size(
                            resizedWidth.toDouble(),
                            resizedHeight.toDouble()
                        ),
                        0.0,
                        0.0,
                        Imgproc.INTER_AREA
                    )

                    val canvas =
                        Mat.zeros(
                            MODEL_SIZE,
                            MODEL_SIZE,
                            CvType.CV_8UC1
                        )

                    try {
                        val xOffset =
                            (
                                MODEL_SIZE -
                                    resizedWidth
                                ) / 2

                        val yOffset =
                            (
                                MODEL_SIZE -
                                    resizedHeight
                                ) / 2

                        val roi =
                            canvas.submat(
                                Rect(
                                    xOffset,
                                    yOffset,
                                    resizedWidth,
                                    resizedHeight
                                )
                            )

                        try {
                            resized.copyTo(
                                roi
                            )
                        } finally {
                            roi.release()
                        }

                        val transposed =
                            Mat()

                        try {
                            Core.transpose(
                                canvas,
                                transposed
                            )

                            val bytes =
                                ByteArray(
                                    MODEL_SIZE *
                                        MODEL_SIZE
                                )

                            val copied =
                                transposed.get(
                                    0,
                                    0,
                                    bytes
                                )

                            if (
                                copied <= 0
                            ) {
                                throw IllegalStateException(
                                    "Could not read preprocessed student ID digit."
                                )
                            }

                            val input =
                                FloatArray(
                                    MODEL_SIZE *
                                        MODEL_SIZE
                                )

                            for (
                                i in bytes.indices
                            ) {
                                input[i] =
                                    (
                                        bytes[i]
                                            .toInt() and 0xFF
                                        ) /
                                        255.0f
                            }

                            return PreprocessDebugResult(
                                input =
                                    input,

                                binary =
                                    binary.clone(),

                                modelInputImage =
                                    transposed.clone()
                            )

                        } finally {
                            transposed.release()
                        }

                    } finally {
                        canvas.release()
                    }

                } finally {
                    resized.release()
                }

            } finally {
                digitMat.release()
            }

        } finally {
            gray.release()
            binary.release()
        }
    }

    private fun predictDigit(
        inputValues: FloatArray
    ): Pair<Int, Float> {

        val input =
            ByteBuffer.allocateDirect(
                MODEL_SIZE *
                    MODEL_SIZE *
                    4
            )
                .order(
                    ByteOrder.nativeOrder()
                )

        inputValues.forEach {
            input.putFloat(it)
        }

        input.rewind()

        val output =
            Array(1) {
                FloatArray(10)
            }

        interpreter.run(
            input,
            output
        )

        val probabilities =
            output[0]

        var bestDigit =
            0

        var bestConfidence =
            probabilities[0]

        for (
            digit in 1 until 10
        ) {
            if (
                probabilities[digit] >
                bestConfidence
            ) {
                bestDigit =
                    digit

                bestConfidence =
                    probabilities[digit]
            }
        }

        return Pair(
            bestDigit,
            bestConfidence
        )
    }

    fun recognize(
        normalizedImage: Mat
    ): StudentIdRecognitionResult {

        require(
            normalizedImage.cols() ==
                NORMALIZED_WIDTH &&
                normalizedImage.rows() ==
                NORMALIZED_HEIGHT
        ) {
            "Student ID recognizer requires a normalized 2480x3508 image."
        }

        val runId =
            System.currentTimeMillis()

        val digitResults =
            mutableListOf<StudentIdDigitResult>()

        for (
            index in 0 until
                STUDENT_ID_DIGITS
        ) {
            val crop =
                getStudentIdCrop(
                    normalizedImage,
                    index
                )

            try {
                val preprocessed =
                    preprocessDigit(
                        crop
                    )

                try {
                    val (
                        digit,
                        confidence
                    ) =
                        predictDigit(
                            preprocessed.input
                        )

                    val cropUri =
                        saveDebugMat(
                            crop,
                            "${runId}_digit_${index + 1}_crop.png"
                        )

                    val binaryUri =
                        saveDebugMat(
                            preprocessed.binary,
                            "${runId}_digit_${index + 1}_binary.png"
                        )

                    val modelInputUri =
                        saveDebugMat(
                            preprocessed.modelInputImage,
                            "${runId}_digit_${index + 1}_model_28x28.png"
                        )

                    digitResults.add(
                        StudentIdDigitResult(
                            position =
                                index + 1,

                            digit =
                                digit,

                            confidence =
                                confidence,

                            cropUri =
                                cropUri,

                            binaryUri =
                                binaryUri,

                            modelInputUri =
                                modelInputUri
                        )
                    )

                } finally {
                    preprocessed.binary.release()
                    preprocessed.modelInputImage.release()
                }

            } finally {
                crop.release()
            }
        }

        val studentId =
            digitResults.joinToString(
                separator = ""
            ) {
                it.digit.toString()
            }

        val minConfidence =
            digitResults.minOf {
                it.confidence
            }

        val averageConfidence =
            digitResults.map {
                it.confidence
            }.average().toFloat()

        val weakPositions =
            digitResults
                .filter {
                    it.confidence <
                        WEAK_CONFIDENCE_THRESHOLD
                }
                .map {
                    it.position
                }

        return StudentIdRecognitionResult(
            success =
                studentId.length ==
                    STUDENT_ID_DIGITS &&
                    weakPositions.isEmpty(),

            studentId =
                studentId,

            digits =
                digitResults,

            minConfidence =
                minConfidence,

            averageConfidence =
                averageConfidence,

            weakPositions =
                weakPositions
        )
    }

    override fun close() {
        interpreter.close()
    }
}
