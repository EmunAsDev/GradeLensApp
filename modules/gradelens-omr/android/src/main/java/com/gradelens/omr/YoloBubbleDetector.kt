package com.gradelens.omr

import android.content.Context

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession

import java.io.Closeable
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.Rect
import org.opencv.core.Scalar
import org.opencv.core.Size
import org.opencv.imgproc.Imgproc

/**
 * Diagnostic-only mobile port of the original GradeLens YOLO detector.
 *
 * Checkpoint 1 intentionally does NOT control the production bubble crops yet.
 * It runs the user's existing best.onnx beside the template-based reader so we
 * can measure detector count, latency, and ROI alignment before changing any
 * answer decision behavior.
 *
 * Model contract from the original engine artifact:
 *   input  : [1, 3, 640, 640] float32
 *   output : [1, 5, 8400] float32
 *   class  : 0 = "marked"
 *
 * The 5 output channels are interpreted as:
 *   cx, cy, width, height, class_score
 *
 * Coordinates are in the 640x640 letterboxed model-input coordinate system.
 */
class YoloBubbleDetector(
    context: Context,
) : Closeable {

    companion object {
        const val MODEL_ASSET =
            "best.onnx"

        const val INPUT_SIZE =
            640

        const val CLASS_NAME =
            "marked"

        /**
         * Checkpoint 4.6 frozen production physical-mark proposal threshold.
         *
         * 0.10f is kept as the practical high-recall proposal threshold. Normal
         * full shades have remained strong in the control captures; YOLO-missed
         * crosses are independently protected by CrossAnalyzer. Partial/irregular
         * shading remains an off-spec edge case for this optimized checkpoint.
         *
         * This threshold means "YOLO proposes meaningful student ink here".
         * It does NOT mean the bubble is a valid selected answer.
         */
        const val CONFIDENCE_THRESHOLD =
            0.10f

        /**
         * Lowest confidence retained only for the diagnostic confidence sweep.
         * One ONNX inference is still used; the active 0.10 proposal set and the
         * sweep points are derived from the same decoded detections.
         */
        const val DIAGNOSTIC_SWEEP_MIN_CONFIDENCE =
            0.05f

        const val NMS_IOU_THRESHOLD =
            0.70f

        const val MAX_DETECTIONS =
            1000
    }

    data class Detection(
        val x1: Double,
        val y1: Double,
        val x2: Double,
        val y2: Double,
        val confidence: Float,
    ) {
        val centerX: Double
            get() =
                (x1 + x2) /
                    2.0

        val centerY: Double
            get() =
                (y1 + y2) /
                    2.0

        val width: Double
            get() =
                max(
                    0.0,
                    x2 - x1,
                )

        val height: Double
            get() =
                max(
                    0.0,
                    y2 - y1,
                )
    }

    data class Timing(
        val totalMs: Double,
        val preprocessMs: Double,
        val inferenceMs: Double,
        val decodeMs: Double,
        val nmsMs: Double,
    )

    data class Result(
        val detections: List<Detection>,
        /**
         * Candidates that passed the applied confidence threshold before NMS.
         * Kept so the native diagnostic can derive higher-threshold counts
         * from the same inference pass.
         */
        val preNmsDetections: List<Detection>,
        val rawCandidateCount: Int,
        val confidenceFilteredCount: Int,
        val appliedConfidenceThreshold: Float,
        val timing: Timing,
        val scale: Double,
        val padX: Int,
        val padY: Int,
        val resizedWidth: Int,
        val resizedHeight: Int,
    )

    private val environment =
        OrtEnvironment.getEnvironment()

    private val sessionOptions =
        OrtSession.SessionOptions().apply {
            setIntraOpNumThreads(
                2
            )
        }

    private val session: OrtSession

    private val inputName: String

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

        session =
            environment.createSession(
                modelBytes,
                sessionOptions,
            )

        inputName =
            session.inputNames.firstOrNull()
                ?: throw IllegalStateException(
                    "YOLO ONNX model does not expose an input tensor."
                )
    }

    fun detect(
        sourceBgr: Mat,
        confidenceThreshold: Float = CONFIDENCE_THRESHOLD,
    ): Result {
        if (
            sourceBgr.empty()
        ) {
            throw IllegalArgumentException(
                "YOLO source image cannot be empty."
            )
        }

        if (
            confidenceThreshold < 0.0f ||
            confidenceThreshold > 1.0f
        ) {
            throw IllegalArgumentException(
                "YOLO confidence threshold must be between 0 and 1."
            )
        }

        val totalStartNs =
            System.nanoTime()

        val preprocessStartNs =
            System.nanoTime()

        val sourceWidth =
            sourceBgr.cols()

        val sourceHeight =
            sourceBgr.rows()

        val letterboxScale =
            min(
                INPUT_SIZE.toDouble() /
                    sourceWidth.toDouble(),
                INPUT_SIZE.toDouble() /
                    sourceHeight.toDouble(),
            )

        val resizedWidth =
            max(
                1,
                (
                    sourceWidth.toDouble() *
                        letterboxScale
                    )
                    .roundToInt(),
            )

        val resizedHeight =
            max(
                1,
                (
                    sourceHeight.toDouble() *
                        letterboxScale
                    )
                    .roundToInt(),
            )

        val padX =
            (
                INPUT_SIZE -
                    resizedWidth
                ) /
                2

        val padY =
            (
                INPUT_SIZE -
                    resizedHeight
                ) /
                2

        val resized =
            Mat()

        val letterboxed =
            Mat(
                INPUT_SIZE,
                INPUT_SIZE,
                CvType.CV_8UC3,
                Scalar(
                    114.0,
                    114.0,
                    114.0,
                ),
            )

        val rgb =
            Mat()

        try {
            Imgproc.resize(
                sourceBgr,
                resized,
                Size(
                    resizedWidth.toDouble(),
                    resizedHeight.toDouble(),
                ),
                0.0,
                0.0,
                Imgproc.INTER_LINEAR,
            )

            val targetRoi =
                letterboxed.submat(
                    Rect(
                        padX,
                        padY,
                        resizedWidth,
                        resizedHeight,
                    )
                )

            try {
                resized.copyTo(
                    targetRoi
                )
            } finally {
                targetRoi.release()
            }

            Imgproc.cvtColor(
                letterboxed,
                rgb,
                Imgproc.COLOR_BGR2RGB,
            )

            val byteData =
                ByteArray(
                    INPUT_SIZE *
                        INPUT_SIZE *
                        3
                )

            rgb.get(
                0,
                0,
                byteData,
            )

            val planeSize =
                INPUT_SIZE *
                    INPUT_SIZE

            val modelInput =
                FloatArray(
                    planeSize *
                        3
                )

            var pixelIndex =
                0

            var byteIndex =
                0

            while (
                pixelIndex <
                planeSize
            ) {
                val r =
                    byteData[
                        byteIndex
                    ]
                        .toInt() and
                        0xFF

                val g =
                    byteData[
                        byteIndex +
                            1
                    ]
                        .toInt() and
                        0xFF

                val b =
                    byteData[
                        byteIndex +
                            2
                    ]
                        .toInt() and
                        0xFF

                modelInput[
                    pixelIndex
                ] =
                    r /
                        255.0f

                modelInput[
                    planeSize +
                        pixelIndex
                ] =
                    g /
                        255.0f

                modelInput[
                    (
                        planeSize *
                            2
                        ) +
                        pixelIndex
                ] =
                    b /
                        255.0f

                pixelIndex++
                byteIndex +=
                    3
            }

            val preprocessNs =
                System.nanoTime() -
                    preprocessStartNs

            val inputBuffer =
                ByteBuffer
                    .allocateDirect(
                        modelInput.size *
                            Float.SIZE_BYTES
                    )
                    .order(
                        ByteOrder.nativeOrder()
                    )
                    .asFloatBuffer()

            inputBuffer.put(
                modelInput
            )

            inputBuffer.rewind()

            val tensor =
                OnnxTensor.createTensor(
                    environment,
                    inputBuffer,
                    longArrayOf(
                        1,
                        3,
                        INPUT_SIZE.toLong(),
                        INPUT_SIZE.toLong(),
                    ),
                )

            try {
                val inferenceStartNs =
                    System.nanoTime()

                val result =
                    session.run(
                        mapOf(
                            inputName to
                                tensor
                        )
                    )

                try {
                    val inferenceNs =
                        System.nanoTime() -
                            inferenceStartNs

                    val decodeStartNs =
                        System.nanoTime()

                    @Suppress("UNCHECKED_CAST")
                    val output =
                        result[0].value as?
                            Array<Array<FloatArray>>
                            ?: throw IllegalStateException(
                                "Unexpected YOLO output type: " +
                                    result[0].value.javaClass.name
                            )

                    if (
                        output.size !=
                            1 ||
                        output[0].size <
                            5
                    ) {
                        throw IllegalStateException(
                            "Unexpected YOLO output shape. Expected [1,5,N]."
                        )
                    }

                    val channels =
                        output[0]

                    val candidateCount =
                        channels[0].size

                    if (
                        channels.any {
                            channel ->
                            channel.size !=
                                candidateCount
                        }
                    ) {
                        throw IllegalStateException(
                            "YOLO output channels do not share one candidate count."
                        )
                    }

                    val decoded =
                        ArrayList<Detection>()

                    for (
                        candidateIndex in
                        0 until candidateCount
                    ) {
                        val score =
                            channels[4][
                                candidateIndex
                            ]

                        if (
                            score <
                            confidenceThreshold
                        ) {
                            continue
                        }

                        val cx =
                            channels[0][
                                candidateIndex
                            ]
                                .toDouble()

                        val cy =
                            channels[1][
                                candidateIndex
                            ]
                                .toDouble()

                        val width =
                            channels[2][
                                candidateIndex
                            ]
                                .toDouble()

                        val height =
                            channels[3][
                                candidateIndex
                            ]
                                .toDouble()

                        if (
                            width <=
                                0.0 ||
                            height <=
                                0.0
                        ) {
                            continue
                        }

                        val modelX1 =
                            cx -
                                (
                                    width /
                                        2.0
                                    )

                        val modelY1 =
                            cy -
                                (
                                    height /
                                        2.0
                                    )

                        val modelX2 =
                            cx +
                                (
                                    width /
                                        2.0
                                    )

                        val modelY2 =
                            cy +
                                (
                                    height /
                                        2.0
                                    )

                        val sourceX1 =
                            (
                                modelX1 -
                                    padX.toDouble()
                                ) /
                                letterboxScale

                        val sourceY1 =
                            (
                                modelY1 -
                                    padY.toDouble()
                                ) /
                                letterboxScale

                        val sourceX2 =
                            (
                                modelX2 -
                                    padX.toDouble()
                                ) /
                                letterboxScale

                        val sourceY2 =
                            (
                                modelY2 -
                                    padY.toDouble()
                                ) /
                                letterboxScale

                        val clippedX1 =
                            sourceX1.coerceIn(
                                0.0,
                                sourceWidth.toDouble() -
                                    1.0,
                            )

                        val clippedY1 =
                            sourceY1.coerceIn(
                                0.0,
                                sourceHeight.toDouble() -
                                    1.0,
                            )

                        val clippedX2 =
                            sourceX2.coerceIn(
                                0.0,
                                sourceWidth.toDouble() -
                                    1.0,
                            )

                        val clippedY2 =
                            sourceY2.coerceIn(
                                0.0,
                                sourceHeight.toDouble() -
                                    1.0,
                            )

                        if (
                            clippedX2 <=
                                clippedX1 ||
                            clippedY2 <=
                                clippedY1
                        ) {
                            continue
                        }

                        decoded.add(
                            Detection(
                                x1 =
                                    clippedX1,
                                y1 =
                                    clippedY1,
                                x2 =
                                    clippedX2,
                                y2 =
                                    clippedY2,
                                confidence =
                                    score,
                            )
                        )
                    }

                    val decodeNs =
                        System.nanoTime() -
                            decodeStartNs

                    val nmsStartNs =
                        System.nanoTime()

                    val kept =
                        nonMaximumSuppression(
                            decoded
                        )

                    val nmsNs =
                        System.nanoTime() -
                            nmsStartNs

                    val totalNs =
                        System.nanoTime() -
                            totalStartNs

                    return Result(
                        detections =
                            kept,
                        preNmsDetections =
                            decoded.toList(),
                        rawCandidateCount =
                            candidateCount,
                        confidenceFilteredCount =
                            decoded.size,
                        appliedConfidenceThreshold =
                            confidenceThreshold,
                        timing =
                            Timing(
                                totalMs =
                                    nsToMs(
                                        totalNs
                                    ),
                                preprocessMs =
                                    nsToMs(
                                        preprocessNs
                                    ),
                                inferenceMs =
                                    nsToMs(
                                        inferenceNs
                                    ),
                                decodeMs =
                                    nsToMs(
                                        decodeNs
                                    ),
                                nmsMs =
                                    nsToMs(
                                        nmsNs
                                    ),
                            ),
                        scale =
                            letterboxScale,
                        padX =
                            padX,
                        padY =
                            padY,
                        resizedWidth =
                            resizedWidth,
                        resizedHeight =
                            resizedHeight,
                    )

                } finally {
                    result.close()
                }

            } finally {
                tensor.close()
            }

        } finally {
            resized.release()
            letterboxed.release()
            rgb.release()
        }
    }

    private fun nonMaximumSuppression(
        detections: List<Detection>,
    ): List<Detection> {
        if (
            detections.isEmpty()
        ) {
            return emptyList()
        }

        val sorted =
            detections
                .sortedByDescending {
                    detection ->
                    detection.confidence
                }

        val kept =
            ArrayList<Detection>()

        for (
            candidate in
            sorted
        ) {
            var suppressed =
                false

            for (
                selected in
                kept
            ) {
                if (
                    intersectionOverUnion(
                        candidate,
                        selected,
                    ) >
                    NMS_IOU_THRESHOLD
                ) {
                    suppressed =
                        true
                    break
                }
            }

            if (
                !suppressed
            ) {
                kept.add(
                    candidate
                )
            }

            if (
                kept.size >=
                MAX_DETECTIONS
            ) {
                break
            }
        }

        return kept
    }

    private fun intersectionOverUnion(
        first: Detection,
        second: Detection,
    ): Float {
        val intersectionX1 =
            max(
                first.x1,
                second.x1,
            )

        val intersectionY1 =
            max(
                first.y1,
                second.y1,
            )

        val intersectionX2 =
            min(
                first.x2,
                second.x2,
            )

        val intersectionY2 =
            min(
                first.y2,
                second.y2,
            )

        val intersectionWidth =
            max(
                0.0,
                intersectionX2 -
                    intersectionX1,
            )

        val intersectionHeight =
            max(
                0.0,
                intersectionY2 -
                    intersectionY1,
            )

        val intersectionArea =
            intersectionWidth *
                intersectionHeight

        val firstArea =
            first.width *
                first.height

        val secondArea =
            second.width *
                second.height

        val unionArea =
            firstArea +
                secondArea -
                intersectionArea

        if (
            unionArea <=
            0.0
        ) {
            return 0.0f
        }

        return (
            intersectionArea /
                unionArea
            )
            .toFloat()
    }

    private fun nsToMs(
        nanoseconds: Long,
    ): Double =
        nanoseconds /
            1_000_000.0

    override fun close() {
        session.close()
        sessionOptions.close()
    }
}
