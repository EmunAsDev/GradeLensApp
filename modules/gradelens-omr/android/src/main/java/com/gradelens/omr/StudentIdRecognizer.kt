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
import org.opencv.imgproc.CLAHE
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
    val reliable: Boolean,
    val consensusCount: Int,
    val variantCount: Int,
    val recognitionMethod: String,
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
         * Multi-pass Student ID recognition.
         *
         * A digit is accepted when either:
         * - at least two independent preprocessing variants agree with usable
         *   confidence, or
         * - one variant is exceptionally strong even when the others disagree.
         *
         * This prevents ordinary lighting variation from turning a correct
         * digit into an automatic whole-ID failure while keeping a conservative
         * fallback for genuinely conflicting predictions.
         */
        private const val CONSENSUS_MIN_CONFIDENCE =
            0.60f

        private const val STRONG_SINGLE_MIN_CONFIDENCE =
            0.90f

        private const val VARIANT_TRIGGER_CONFIDENCE =
            0.80f

        private const val CLAHE_CLIP_LIMIT =
            2.0

        private const val CLAHE_TILE_GRID =
            4.0

        private const val ADAPTIVE_BLOCK_SIZE =
            15

        private const val ADAPTIVE_C =
            4.0
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

    private enum class PreprocessMode(
        val wireName: String
    ) {
        OTSU("otsu"),
        CLAHE_OTSU("clahe_otsu"),
        CLAHE_ADAPTIVE("clahe_adaptive")
    }

    private data class PreprocessDebugResult(
        val input: FloatArray,
        val binary: Mat,
        val modelInputImage: Mat,
        val mode: PreprocessMode
    )

    private data class DigitCandidate(
        val digit: Int,
        val confidence: Float,
        val preprocessed: PreprocessDebugResult
    )

    private data class SelectedDigitCandidate(
        val candidate: DigitCandidate,
        val reliable: Boolean,
        val consensusCount: Int,
        val variantCount: Int,
        val recognitionMethod: String
    )

    private fun preprocessDigit(
        crop: Mat,
        mode: PreprocessMode
    ): PreprocessDebugResult {

        val gray =
            Mat()

        val working =
            Mat()

        val binary =
            Mat()

        var clahe:
            CLAHE? =
            null

        try {
            Imgproc.cvtColor(
                crop,
                gray,
                Imgproc.COLOR_BGR2GRAY
            )

            when (
                mode
            ) {
                PreprocessMode.OTSU -> {
                    gray.copyTo(
                        working
                    )

                    Imgproc.threshold(
                        working,
                        binary,
                        0.0,
                        255.0,
                        Imgproc.THRESH_BINARY_INV or
                            Imgproc.THRESH_OTSU
                    )
                }

                PreprocessMode.CLAHE_OTSU -> {
                    clahe =
                        Imgproc.createCLAHE(
                            CLAHE_CLIP_LIMIT,
                            Size(
                                CLAHE_TILE_GRID,
                                CLAHE_TILE_GRID
                            )
                        )

                    clahe.apply(
                        gray,
                        working
                    )

                    Imgproc.threshold(
                        working,
                        binary,
                        0.0,
                        255.0,
                        Imgproc.THRESH_BINARY_INV or
                            Imgproc.THRESH_OTSU
                    )
                }

                PreprocessMode.CLAHE_ADAPTIVE -> {
                    clahe =
                        Imgproc.createCLAHE(
                            CLAHE_CLIP_LIMIT,
                            Size(
                                CLAHE_TILE_GRID,
                                CLAHE_TILE_GRID
                            )
                        )

                    clahe.apply(
                        gray,
                        working
                    )

                    Imgproc.adaptiveThreshold(
                        working,
                        binary,
                        255.0,
                        Imgproc.ADAPTIVE_THRESH_GAUSSIAN_C,
                        Imgproc.THRESH_BINARY_INV,
                        ADAPTIVE_BLOCK_SIZE,
                        ADAPTIVE_C
                    )
                }
            }

            val contours =
                mutableListOf<MatOfPoint>()

            val hierarchy =
                Mat()

            val contourInput =
                binary.clone()

            try {
                Imgproc.findContours(
                    contourInput,
                    contours,
                    hierarchy,
                    Imgproc.RETR_EXTERNAL,
                    Imgproc.CHAIN_APPROX_SIMPLE
                )
            } finally {
                contourInput.release()
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
                                    transposed.clone(),

                                mode =
                                    mode
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
            working.release()
            binary.release()
            clahe?.collectGarbage()
        }
    }

    private fun buildDigitCandidate(
        crop: Mat,
        mode: PreprocessMode
    ): DigitCandidate {
        val preprocessed =
            preprocessDigit(
                crop,
                mode
            )

        val (
            digit,
            confidence
        ) =
            predictDigit(
                preprocessed.input
            )

        return DigitCandidate(
            digit =
                digit,

            confidence =
                confidence,

            preprocessed =
                preprocessed
        )
    }

    private fun selectDigitCandidate(
        candidates: List<DigitCandidate>
    ): SelectedDigitCandidate {
        require(
            candidates.isNotEmpty()
        ) {
            "At least one Student ID digit candidate is required."
        }

        val grouped =
            candidates.groupBy {
                it.digit
            }

        val winningGroup =
            grouped.values
                .sortedWith(
                    compareByDescending<List<DigitCandidate>> {
                        it.size
                    }
                        .thenByDescending {
                            it.maxOf { candidate ->
                                candidate.confidence
                            }
                        }
                        .thenByDescending {
                            it.map { candidate ->
                                candidate.confidence
                            }.average()
                        }
                )
                .first()

        val selected =
            winningGroup.maxBy {
                it.confidence
            }

        val consensusCount =
            winningGroup.size

        val reliable =
            if (
                consensusCount >=
                    2
            ) {
                selected.confidence >=
                    CONSENSUS_MIN_CONFIDENCE
            } else {
                selected.confidence >=
                    STRONG_SINGLE_MIN_CONFIDENCE
            }

        val recognitionMethod =
            if (
                consensusCount >=
                    2
            ) {
                "consensus"
            } else {
                "best_confidence"
            }

        return SelectedDigitCandidate(
            candidate =
                selected,

            reliable =
                reliable,

            consensusCount =
                consensusCount,

            variantCount =
                candidates.size,

            recognitionMethod =
                recognitionMethod
        )
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

            val candidates =
                mutableListOf<DigitCandidate>()

            try {
                val originalCandidate =
                    buildDigitCandidate(
                        crop,
                        PreprocessMode.OTSU
                    )

                candidates.add(
                    originalCandidate
                )

                val enhancedCandidate =
                    buildDigitCandidate(
                        crop,
                        PreprocessMode.CLAHE_OTSU
                    )

                candidates.add(
                    enhancedCandidate
                )

                /*
                 * The adaptive variant is a fallback, not the default. Run it
                 * only when the first two passes disagree or neither is strong.
                 */
                val shouldRunAdaptive =
                    originalCandidate.digit !=
                        enhancedCandidate.digit ||
                    max(
                        originalCandidate.confidence,
                        enhancedCandidate.confidence
                    ) <
                        VARIANT_TRIGGER_CONFIDENCE

                if (
                    shouldRunAdaptive
                ) {
                    candidates.add(
                        buildDigitCandidate(
                            crop,
                            PreprocessMode.CLAHE_ADAPTIVE
                        )
                    )
                }

                val selected =
                    selectDigitCandidate(
                        candidates
                    )

                val cropUri =
                    saveDebugMat(
                        crop,
                        "${runId}_digit_${index + 1}_crop.png"
                    )

                val binaryUri =
                    saveDebugMat(
                        selected.candidate.preprocessed.binary,
                        "${runId}_digit_${index + 1}_${selected.candidate.preprocessed.mode.wireName}_binary.png"
                    )

                val modelInputUri =
                    saveDebugMat(
                        selected.candidate.preprocessed.modelInputImage,
                        "${runId}_digit_${index + 1}_${selected.candidate.preprocessed.mode.wireName}_model_28x28.png"
                    )

                digitResults.add(
                    StudentIdDigitResult(
                        position =
                            index + 1,

                        digit =
                            selected.candidate.digit,

                        confidence =
                            selected.candidate.confidence,

                        reliable =
                            selected.reliable,

                        consensusCount =
                            selected.consensusCount,

                        variantCount =
                            selected.variantCount,

                        recognitionMethod =
                            selected.recognitionMethod,

                        cropUri =
                            cropUri,

                        binaryUri =
                            binaryUri,

                        modelInputUri =
                            modelInputUri
                    )
                )

            } finally {
                candidates.forEach {
                    it.preprocessed.binary.release()
                    it.preprocessed.modelInputImage.release()
                }

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
                    !it.reliable
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
