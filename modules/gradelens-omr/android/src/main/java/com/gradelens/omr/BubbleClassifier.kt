package com.gradelens.omr

import android.content.Context

import java.io.Closeable
import java.nio.ByteBuffer
import java.nio.ByteOrder

import kotlin.math.sqrt

import org.opencv.core.Core
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.Size
import org.opencv.imgproc.Imgproc

import org.tensorflow.lite.Interpreter


class BubbleClassifier(
    context: Context,
) : Closeable {

    companion object {

        const val MODEL_ASSET =
            "best_hybrid_bubble_classifier_v3.tflite"

        const val IMAGE_SIZE =
            128

        const val FEATURE_COUNT =
            10

        const val CLASS_COUNT =
            4

        val CLASSES =
            listOf(
                "Crossed_Bubble",
                "Unshaded_Bubble",
                "Shaded_Bubble",
                "Invalid_Bubble",
            )

        private const val INPUT_IMAGE_INDEX =
            0

        private const val INPUT_DENSITY_INDEX =
            1

        private const val INPUT_STRUCTURAL_INDEX =
            2
    }

    data class Prediction(
        val label: String,
        val classIndex: Int,
        val confidence: Float,
        val probabilities: FloatArray,
        val margin: Float,
    )


    /*
    |--------------------------------------------------------------------------
    | Performance Profiling
    |--------------------------------------------------------------------------
    |
    | These counters are diagnostic only. They do not alter model inputs,
    | preprocessing, class order, thresholds, or inference behavior.
    |
    |--------------------------------------------------------------------------
    */

    data class TimingSnapshot(
        val predictCount: Int,
        val totalPredictNs: Long,
        val resizeNs: Long,
        val imageInputNs: Long,
        val densityTotalNs: Long,
        val densityGrayNs: Long,
        val densityHistogramNs: Long,
        val structuralTotalNs: Long,
        val structuralGrayNs: Long,
        val cannyNs: Long,
        val edgeDensityNs: Long,
        val houghLinesNs: Long,
        val structuralPackNs: Long,
        val tfliteInferenceNs: Long,
        val outputParsingNs: Long,
    ) {

        private fun ms(
            value: Long,
        ): Double =
            value /
                1_000_000.0

        fun asMilliseconds():
            Map<String, Any> =
            mapOf(
                "predictCount" to
                    predictCount,

                "totalPredict" to
                    ms(
                        totalPredictNs
                    ),

                "resize" to
                    ms(
                        resizeNs
                    ),

                "imageInput" to
                    ms(
                        imageInputNs
                    ),

                "densityTotal" to
                    ms(
                        densityTotalNs
                    ),

                "densityGray" to
                    ms(
                        densityGrayNs
                    ),

                "densityHistogram" to
                    ms(
                        densityHistogramNs
                    ),

                "structuralTotal" to
                    ms(
                        structuralTotalNs
                    ),

                "structuralGray" to
                    ms(
                        structuralGrayNs
                    ),

                "canny" to
                    ms(
                        cannyNs
                    ),

                "edgeDensity" to
                    ms(
                        edgeDensityNs
                    ),

                "houghLines" to
                    ms(
                        houghLinesNs
                    ),

                "structuralPack" to
                    ms(
                        structuralPackNs
                    ),

                "tfliteInference" to
                    ms(
                        tfliteInferenceNs
                    ),

                "outputParsing" to
                    ms(
                        outputParsingNs
                    ),
            )
    }

    private var timingPredictCount =
        0

    private var timingTotalPredictNs =
        0L

    private var timingResizeNs =
        0L

    private var timingImageInputNs =
        0L

    private var timingDensityTotalNs =
        0L

    private var timingDensityGrayNs =
        0L

    private var timingDensityHistogramNs =
        0L

    private var timingStructuralTotalNs =
        0L

    private var timingStructuralGrayNs =
        0L

    private var timingCannyNs =
        0L

    private var timingEdgeDensityNs =
        0L

    private var timingHoughLinesNs =
        0L

    private var timingStructuralPackNs =
        0L

    private var timingTfliteInferenceNs =
        0L

    private var timingOutputParsingNs =
        0L

    fun timingSnapshot():
        TimingSnapshot =
        TimingSnapshot(
            predictCount =
                timingPredictCount,

            totalPredictNs =
                timingTotalPredictNs,

            resizeNs =
                timingResizeNs,

            imageInputNs =
                timingImageInputNs,

            densityTotalNs =
                timingDensityTotalNs,

            densityGrayNs =
                timingDensityGrayNs,

            densityHistogramNs =
                timingDensityHistogramNs,

            structuralTotalNs =
                timingStructuralTotalNs,

            structuralGrayNs =
                timingStructuralGrayNs,

            cannyNs =
                timingCannyNs,

            edgeDensityNs =
                timingEdgeDensityNs,

            houghLinesNs =
                timingHoughLinesNs,

            structuralPackNs =
                timingStructuralPackNs,

            tfliteInferenceNs =
                timingTfliteInferenceNs,

            outputParsingNs =
                timingOutputParsingNs,
        )

    private val interpreter:
        Interpreter

    init {

        val modelBytes =
            context.assets
                .open(
                    MODEL_ASSET
                )
                .use {
                    input ->
                    input.readBytes()
                }

        val modelBuffer =
            ByteBuffer
                .allocateDirect(
                    modelBytes.size
                )
                .order(
                    ByteOrder.nativeOrder()
                )

        modelBuffer.put(
            modelBytes
        )

        modelBuffer.rewind()

        val options =
            Interpreter.Options().apply {
                setNumThreads(
                    2
                )
            }

        interpreter =
            Interpreter(
                modelBuffer,
                options,
            )

        validateModelContract()
    }

    fun predict(
        crop: Mat,
    ): Prediction {

        val predictStartNs =
            android.os.SystemClock.elapsedRealtimeNanos()

        if (
            crop.empty()
        ) {
            throw IllegalArgumentException(
                "Bubble crop cannot be empty."
            )
        }

        val resized =
            Mat()

        try {

            val resizeStartNs =
                android.os.SystemClock.elapsedRealtimeNanos()

            Imgproc.resize(
                crop,
                resized,
                Size(
                    IMAGE_SIZE.toDouble(),
                    IMAGE_SIZE.toDouble(),
                ),
                0.0,
                0.0,
                Imgproc.INTER_LINEAR,
            )

            timingResizeNs +=
                android.os.SystemClock.elapsedRealtimeNanos() -
                    resizeStartNs

            val imageInputStartNs =
                android.os.SystemClock.elapsedRealtimeNanos()

            val imageInput =
                createImageInput(
                    resized
                )

            timingImageInputNs +=
                android.os.SystemClock.elapsedRealtimeNanos() -
                    imageInputStartNs

            val densityStartNs =
                android.os.SystemClock.elapsedRealtimeNanos()

            val densityInput =
                createDensityInput(
                    resized
                )

            timingDensityTotalNs +=
                android.os.SystemClock.elapsedRealtimeNanos() -
                    densityStartNs

            val structuralStartNs =
                android.os.SystemClock.elapsedRealtimeNanos()

            val structuralInput =
                createStructuralInput(
                    resized
                )

            timingStructuralTotalNs +=
                android.os.SystemClock.elapsedRealtimeNanos() -
                    structuralStartNs

            val output =
                Array(
                    1
                ) {
                    FloatArray(
                        CLASS_COUNT
                    )
                }

            val inputs =
                arrayOf(
                    imageInput,
                    densityInput,
                    structuralInput,
                )

            val outputs =
                mutableMapOf<Int, Any>(
                    0 to output
                )

            val tfliteStartNs =
                android.os.SystemClock.elapsedRealtimeNanos()

            interpreter.runForMultipleInputsOutputs(
                inputs,
                outputs,
            )

            timingTfliteInferenceNs +=
                android.os.SystemClock.elapsedRealtimeNanos() -
                    tfliteStartNs

            val outputParsingStartNs =
                android.os.SystemClock.elapsedRealtimeNanos()

            val probabilities =
                output[0]

            var bestIndex =
                0

            var bestProbability =
                probabilities[0]

            for (
                index in
                1 until probabilities.size
            ) {

                if (
                    probabilities[index] >
                    bestProbability
                ) {

                    bestIndex =
                        index

                    bestProbability =
                        probabilities[index]
                }
            }

            val sorted =
                probabilities
                    .sortedDescending()

            val margin =
                if (
                    sorted.size >=
                    2
                ) {

                    sorted[0] -
                        sorted[1]

                } else {

                    0.0f
                }

            val prediction =
                Prediction(
                    label =
                        CLASSES[
                            bestIndex
                        ],

                    classIndex =
                        bestIndex,

                    confidence =
                        bestProbability,

                    probabilities =
                        probabilities.copyOf(),

                    margin =
                        margin,
                )

            timingOutputParsingNs +=
                android.os.SystemClock.elapsedRealtimeNanos() -
                    outputParsingStartNs

            return prediction

        } finally {

            resized.release()

            timingPredictCount++

            timingTotalPredictNs +=
                android.os.SystemClock.elapsedRealtimeNanos() -
                    predictStartNs
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Image input
    |--------------------------------------------------------------------------
    |
    | Python behavior:
    |
    | cv2.resize(...)
    | astype("float32")
    |
    | IMPORTANT:
    | no /255 here because the Keras model itself contains a rescaling layer.
    |
    |--------------------------------------------------------------------------
    */

    private fun createImageInput(
        image: Mat,
    ): Array<Array<Array<FloatArray>>> {

        if (
            image.rows() !=
                IMAGE_SIZE ||
            image.cols() !=
                IMAGE_SIZE
        ) {
            throw IllegalArgumentException(
                "Bubble classifier image input must be ${IMAGE_SIZE}x${IMAGE_SIZE}."
            )
        }

        if (
            image.channels() !=
                3
        ) {
            throw IllegalArgumentException(
                "Bubble classifier image input must have exactly 3 BGR channels."
            )
        }

        /*
         * IMPORTANT:
         *
         * The previous implementation called image.get(y, x) once for every
         * pixel. That crosses the OpenCV/JNI boundary 16,384 times per bubble.
         *
         * This version reads the entire CV_8UC3 Mat into one contiguous byte
         * array in a single bulk call, then copies those exact BGR byte values
         * into the same FloatArray model structure.
         *
         * Model behavior remains unchanged:
         *
         * - BGR order is preserved.
         * - Values remain in the original 0..255 range.
         * - There is still NO external /255 normalization.
         */

        val pixelBytes =
            ByteArray(
                IMAGE_SIZE *
                    IMAGE_SIZE *
                    3
            )

        val copiedValues =
            image.get(
                0,
                0,
                pixelBytes
            )

        val expectedValues =
            pixelBytes.size

        if (
            copiedValues !=
                expectedValues
        ) {
            throw IllegalStateException(
                "Could not read complete bubble image buffer. " +
                    "Expected $expectedValues values, received $copiedValues."
            )
        }

        val input =
            Array(
                1
            ) {
                Array(
                    IMAGE_SIZE
                ) {
                    Array(
                        IMAGE_SIZE
                    ) {
                        FloatArray(
                            3
                        )
                    }
                }
            }

        var sourceIndex =
            0

        for (
            y in
            0 until IMAGE_SIZE
        ) {

            for (
                x in
                0 until IMAGE_SIZE
            ) {

                /*
                 * Kotlin Byte is signed (-128..127).
                 *
                 * `and 0xFF` restores the original unsigned OpenCV byte value
                 * (0..255) before converting it to Float.
                 */

                input[0][y][x][0] =
                    (
                        pixelBytes[
                            sourceIndex
                        ].toInt() and
                            0xFF
                    ).toFloat()

                input[0][y][x][1] =
                    (
                        pixelBytes[
                            sourceIndex +
                                1
                        ].toInt() and
                            0xFF
                    ).toFloat()

                input[0][y][x][2] =
                    (
                        pixelBytes[
                            sourceIndex +
                                2
                        ].toInt() and
                            0xFF
                    ).toFloat()

                sourceIndex +=
                    3
            }
        }

        return input
    }

    /*
    |--------------------------------------------------------------------------
    | Density features
    |--------------------------------------------------------------------------
    |
    | Exact Python equivalent:
    |
    | gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    | hist = cv2.calcHist([gray], [0], None, [10], [0, 256])
    | hist = cv2.normalize(hist, hist).flatten()
    |
    |--------------------------------------------------------------------------
    */

    private fun createDensityInput(
        image: Mat,
    ): Array<FloatArray> {

        val gray =
            Mat()

        val hist =
            Mat()

        try {

            val grayStartNs =
                android.os.SystemClock.elapsedRealtimeNanos()

            toGray(
                image,
                gray
            )

            timingDensityGrayNs +=
                android.os.SystemClock.elapsedRealtimeNanos() -
                    grayStartNs

            val histogramStartNs =
                android.os.SystemClock.elapsedRealtimeNanos()

            Imgproc.calcHist(
                listOf(
                    gray
                ),
                org.opencv.core.MatOfInt(
                    0
                ),
                Mat(),
                hist,
                org.opencv.core.MatOfInt(
                    FEATURE_COUNT
                ),
                org.opencv.core.MatOfFloat(
                    0.0f,
                    256.0f,
                ),
            )

            Core.normalize(
                hist,
                hist
            )

            val result =
                FloatArray(
                    FEATURE_COUNT
                )

            for (
                index in
                0 until FEATURE_COUNT
            ) {

                result[index] =
                    hist.get(
                        index,
                        0
                    )[0]
                        .toFloat()
            }

            val densityOutput =
                arrayOf(
                    result
                )

            timingDensityHistogramNs +=
                android.os.SystemClock.elapsedRealtimeNanos() -
                    histogramStartNs

            return densityOutput

        } finally {

            gray.release()

            hist.release()
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Structural features
    |--------------------------------------------------------------------------
    |
    | Exact Python behavior:
    |
    | edges = cv2.Canny(gray, 100, 200)
    |
    | edge_density =
    |     np.sum(edges) / edges.size
    |
    | lines =
    |     cv2.HoughLines(
    |         edges,
    |         1,
    |         np.pi / 180,
    |         50
    |     )
    |
    | line_count =
    |     0 if lines is None else len(lines)
    |
    | features =
    |     [edge_density, line_count, 0,0,0,0,0,0,0,0]
    |
    |--------------------------------------------------------------------------
    */

    private fun createStructuralInput(
        image: Mat,
    ): Array<FloatArray> {

        val gray =
            Mat()

        val edges =
            Mat()

        val lines =
            Mat()

        try {

            val grayStartNs =
                android.os.SystemClock.elapsedRealtimeNanos()

            toGray(
                image,
                gray
            )

            timingStructuralGrayNs +=
                android.os.SystemClock.elapsedRealtimeNanos() -
                    grayStartNs

            val cannyStartNs =
                android.os.SystemClock.elapsedRealtimeNanos()

            Imgproc.Canny(
                gray,
                edges,
                100.0,
                200.0,
            )

            timingCannyNs +=
                android.os.SystemClock.elapsedRealtimeNanos() -
                    cannyStartNs

            /*
             * Python:
             *
             * np.sum(edges) / edges.size
             *
             * edges contain 0 or 255,
             * so we must sum the actual pixel values,
             * NOT simply count non-zero pixels.
             */

            val edgeDensityStartNs =
                android.os.SystemClock.elapsedRealtimeNanos()

            val edgeSum =
                Core.sumElems(
                    edges
                ).`val`[0]

            val edgePixelCount =
                edges.total()
                    .toDouble()

            val edgeDensity =
                if (
                    edgePixelCount >
                    0.0
                ) {

                    edgeSum /
                        edgePixelCount

                } else {

                    0.0
                }

            timingEdgeDensityNs +=
                android.os.SystemClock.elapsedRealtimeNanos() -
                    edgeDensityStartNs

            val houghStartNs =
                android.os.SystemClock.elapsedRealtimeNanos()

            Imgproc.HoughLines(
                edges,
                lines,
                1.0,
                Math.PI /
                    180.0,
                50,
            )

            timingHoughLinesNs +=
                android.os.SystemClock.elapsedRealtimeNanos() -
                    houghStartNs

            val structuralPackStartNs =
                android.os.SystemClock.elapsedRealtimeNanos()

            val lineCount =
                if (
                    lines.empty()
                ) {
                    0.0
                } else {
                    lines.rows()
                        .toDouble()
                }

            val result =
                FloatArray(
                    FEATURE_COUNT
                )

            result[0] =
                edgeDensity
                    .toFloat()

            result[1] =
                lineCount
                    .toFloat()

            val structuralOutput =
                arrayOf(
                    result
                )

            timingStructuralPackNs +=
                android.os.SystemClock.elapsedRealtimeNanos() -
                    structuralPackStartNs

            return structuralOutput

        } finally {

            gray.release()

            edges.release()

            lines.release()
        }
    }

    private fun toGray(
        source: Mat,
        destination: Mat,
    ) {

        when (
            source.channels()
        ) {

            1 -> {
                source.copyTo(
                    destination
                )
            }

            3 -> {
                Imgproc.cvtColor(
                    source,
                    destination,
                    Imgproc.COLOR_BGR2GRAY,
                )
            }

            4 -> {
                Imgproc.cvtColor(
                    source,
                    destination,
                    Imgproc.COLOR_BGRA2GRAY,
                )
            }

            else -> {
                throw IllegalArgumentException(
                    "Unsupported bubble crop channel count: ${source.channels()}."
                )
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | TFLite model contract
    |--------------------------------------------------------------------------
    */

    private fun validateModelContract() {

        if (
            interpreter.inputTensorCount !=
            3
        ) {
            throw IllegalStateException(
                "Bubble TFLite model must have exactly 3 inputs."
            )
        }

        if (
            interpreter.outputTensorCount !=
            1
        ) {
            throw IllegalStateException(
                "Bubble TFLite model must have exactly 1 output."
            )
        }

        val imageShape =
            interpreter
                .getInputTensor(
                    INPUT_IMAGE_INDEX
                )
                .shape()

        val densityShape =
            interpreter
                .getInputTensor(
                    INPUT_DENSITY_INDEX
                )
                .shape()

        val structuralShape =
            interpreter
                .getInputTensor(
                    INPUT_STRUCTURAL_INDEX
                )
                .shape()

        val outputShape =
            interpreter
                .getOutputTensor(
                    0
                )
                .shape()

        if (
            !imageShape.contentEquals(
                intArrayOf(
                    1,
                    IMAGE_SIZE,
                    IMAGE_SIZE,
                    3,
                )
            )
        ) {
            throw IllegalStateException(
                "Unexpected bubble image input shape: ${imageShape.contentToString()}."
            )
        }

        if (
            !densityShape.contentEquals(
                intArrayOf(
                    1,
                    FEATURE_COUNT,
                )
            )
        ) {
            throw IllegalStateException(
                "Unexpected bubble density input shape: ${densityShape.contentToString()}."
            )
        }

        if (
            !structuralShape.contentEquals(
                intArrayOf(
                    1,
                    FEATURE_COUNT,
                )
            )
        ) {
            throw IllegalStateException(
                "Unexpected bubble structural input shape: ${structuralShape.contentToString()}."
            )
        }

        if (
            !outputShape.contentEquals(
                intArrayOf(
                    1,
                    CLASS_COUNT,
                )
            )
        ) {
            throw IllegalStateException(
                "Unexpected bubble output shape: ${outputShape.contentToString()}."
            )
        }
    }

    override fun close() {

        interpreter.close()
    }
}