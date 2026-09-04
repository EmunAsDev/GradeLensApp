package com.gradelens.omr

import android.net.Uri
import android.util.Log

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

import org.opencv.android.OpenCVLoader
import org.opencv.core.Core
import org.opencv.core.Mat
import org.opencv.core.MatOfPoint2f
import org.opencv.core.Point
import org.opencv.core.Size
import org.opencv.imgcodecs.Imgcodecs
import org.opencv.imgproc.Imgproc
import org.opencv.objdetect.ArucoDetector
import org.opencv.objdetect.Objdetect
import org.opencv.objdetect.QRCodeDetector

import java.io.File

import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

class GradeLensOmrModule : Module() {

    companion object {

        private const val TAG =
            "GradeLensOmr"

        /*
        |--------------------------------------------------------------------------
        | Normalized Sheet
        |--------------------------------------------------------------------------
        */

        private const val NORMALIZED_WIDTH =
            2480

        private const val NORMALIZED_HEIGHT =
            3508

        private const val SHEET_WIDTH_MM =
            148.5

        private const val SHEET_HEIGHT_MM =
            210.0

        /*
        |--------------------------------------------------------------------------
        | 50-Item Geometry
        |--------------------------------------------------------------------------
        */

        /*
        |--------------------------------------------------------------------------
        | Answer-Sheet QR Geometry
        |--------------------------------------------------------------------------
        |
        | Must match Laravel AnswerSheetGeometry50:
        | x = 116 mm, y = 7 mm, size = 23 mm.
        |
        */

        private const val QR_X_MM =
            116.0

        private const val QR_Y_MM =
            7.0

        private const val QR_SIZE_MM =
            23.0

        private const val QR_CROP_MARGIN_MM =
            4.0

        private const val QUESTION_COUNT_50 =
            50

        private const val ROWS_PER_COLUMN_50 =
            25

        private const val FIRST_ROW_Y_MM_50 =
            61.0

        private const val ROW_PITCH_MM_50 =
            5.45

        private const val LEFT_COLUMN_X_MM_50 =
            36.0

        private const val RIGHT_COLUMN_X_MM_50 =
            86.0

        private const val CHOICE_PITCH_MM_50 =
            5.2

        /*
        |--------------------------------------------------------------------------
        | 100-Item Geometry
        |--------------------------------------------------------------------------
        |
        | Must match the current Laravel AnswerSheetGeometry100.
        |
        | Four question columns x 25 rows. Bubble diameter is slightly smaller
        | than the 50-item sheet, but the same calibrated coverage/cross logic
        | is intentionally reused for this first Android parity checkpoint.
        |
        */

        private const val QUESTION_COUNT_100 =
            100

        private const val ROWS_PER_COLUMN_100 =
            25

        private const val FIRST_ROW_Y_MM_100 =
            61.0

        private const val ROW_PITCH_MM_100 =
            5.45

        private val COLUMN_START_X_MM_100 =
            doubleArrayOf(
                18.5,
                50.5,
                82.5,
                114.5,
            )

        private const val CHOICE_PITCH_MM_100 =
            4.6

        /*
        |--------------------------------------------------------------------------
        | 50-Item Coverage Calibration
        |--------------------------------------------------------------------------
        */

        private const val COVERAGE_CONTEXT_MM =
            6.0

        private const val ANALYSIS_RADIUS_MM =
            1.50

        private const val BACKGROUND_INNER_RADIUS_MM =
            2.05

        private const val BACKGROUND_OUTER_RADIUS_MM =
            2.45

        private const val PIXEL_DARKNESS_EXCESS =
            0.12

        private const val UNSHADED_MAX =
            0.35

        private const val SHADED_MIN =
            0.85

        @Volatile
        private var openCvInitialized =
            false
    }

    override fun definition() =
        ModuleDefinition {

            Name(
                "GradeLensOmr"
            )

            /*
            |--------------------------------------------------------------------------
            | OpenCV Initialization
            |--------------------------------------------------------------------------
            */

            OnCreate {
                ensureOpenCvInitialized()
            }

            /*
            |--------------------------------------------------------------------------
            | Diagnostics
            |--------------------------------------------------------------------------
            */

            Function(
                "hello"
            ) {
                "GradeLens OMR native module is working."
            }

            Function(
                "getOpenCvVersion"
            ) {

                ensureOpenCvInitialized()

                Core.VERSION
            }

            /*
            |--------------------------------------------------------------------------
            | Detect Markers
            |--------------------------------------------------------------------------
            */

            AsyncFunction(
                "detectMarkers"
            ) { imageUri: String ->

                val normalizationStartNs =
                    android.os.SystemClock.elapsedRealtimeNanos()

                ensureOpenCvInitialized()

                val imagePath =
                    uriToPath(
                        imageUri
                    )

                val normalizationImageLoadStartNs =
                    android.os.SystemClock.elapsedRealtimeNanos()

                val image =
                    Imgcodecs.imread(
                        imagePath,
                        Imgcodecs.IMREAD_COLOR
                    )

                val normalizationImageLoadNs =
                    android.os.SystemClock.elapsedRealtimeNanos() -
                        normalizationImageLoadStartNs

                if (image.empty()) {

                    image.release()

                    throw Exception(
                        "OpenCV could not load the captured image."
                    )
                }

                try {

                    val markerDetectionStartNs =
                        android.os.SystemClock.elapsedRealtimeNanos()

                    val markerResult =
                        detectSheetMarkers(
                            image
                        )

                    val markerDetectionNs =
                        android.os.SystemClock.elapsedRealtimeNanos() -
                            markerDetectionStartNs

                    mapOf(
                        "success" to
                            markerResult.success,

                        "markerCount" to
                            markerResult.markerIds.size,

                        "markerIds" to
                            markerResult.markerIds.sorted(),

                        "missingIds" to
                            markerResult.missingIds,

                        "rejectedCount" to
                            markerResult.rejectedCount,

                        "openCvVersion" to
                            Core.VERSION
                    )

                } finally {

                    image.release()
                }
            }

            /*
            |--------------------------------------------------------------------------
            | Normalize Sheet
            |--------------------------------------------------------------------------
            */

            AsyncFunction(
                "normalizeSheet"
            ) { imageUri: String ->

                val normalizationStartNs =
                    android.os.SystemClock.elapsedRealtimeNanos()

                ensureOpenCvInitialized()

                val imagePath =
                    uriToPath(
                        imageUri
                    )

                Log.d(
                    TAG,
                    "Normalizing image: $imagePath"
                )

                val normalizationImageLoadStartNs =
                    android.os.SystemClock.elapsedRealtimeNanos()

                val image =
                    Imgcodecs.imread(
                        imagePath,
                        Imgcodecs.IMREAD_COLOR
                    )

                val normalizationImageLoadNs =
                    android.os.SystemClock.elapsedRealtimeNanos() -
                        normalizationImageLoadStartNs

                if (image.empty()) {

                    image.release()

                    throw Exception(
                        "OpenCV could not load the captured image."
                    )
                }

                try {

                    val markerDetectionStartNs =
                        android.os.SystemClock.elapsedRealtimeNanos()

                    val markerResult =
                        detectSheetMarkers(
                            image
                        )

                    val markerDetectionNs =
                        android.os.SystemClock.elapsedRealtimeNanos() -
                            markerDetectionStartNs

                    if (!markerResult.success) {

                        throw Exception(
                            "Missing required markers: ${markerResult.missingIds}"
                        )
                    }

                    val sourcePoints =
                        buildSourcePoints(
                            markerResult.markerCorners
                        )

                    val destinationPoints =
                        buildDestinationPoints()

                    val transform =
                        Imgproc.getPerspectiveTransform(
                            sourcePoints,
                            destinationPoints
                        )

                    val normalized =
                        Mat()

                    try {

                        val perspectiveWarpStartNs =
                            android.os.SystemClock.elapsedRealtimeNanos()

                        Imgproc.warpPerspective(
                            image,
                            normalized,
                            transform,
                            Size(
                                NORMALIZED_WIDTH.toDouble(),
                                NORMALIZED_HEIGHT.toDouble()
                            ),
                            Imgproc.INTER_LINEAR
                        )

                        val perspectiveWarpNs =
                            android.os.SystemClock.elapsedRealtimeNanos() -
                                perspectiveWarpStartNs

                        val outputFile =
                            File(
                                appContext.cacheDirectory,
                                "gradelens_normalized_${System.currentTimeMillis()}.jpg"
                            )

                        val normalizedSaveStartNs =
                            android.os.SystemClock.elapsedRealtimeNanos()

                        val saved =
                            Imgcodecs.imwrite(
                                outputFile.absolutePath,
                                normalized
                            )

                        val normalizedSaveNs =
                            android.os.SystemClock.elapsedRealtimeNanos() -
                                normalizedSaveStartNs

                        if (!saved) {

                            throw Exception(
                                "Could not save normalized image."
                            )
                        }

                        Log.d(
                            TAG,
                            "Normalized image saved: ${outputFile.absolutePath}"
                        )

                        mapOf(
                            "success" to true,

                            "markerIds" to
                                markerResult.markerIds.sorted(),

                            "missingIds" to
                                emptyList<Int>(),

                            "normalizedUri" to
                                Uri.fromFile(
                                    outputFile
                                ).toString(),

                            "width" to
                                NORMALIZED_WIDTH,

                            "height" to
                                NORMALIZED_HEIGHT,

                            "openCvVersion" to
                                Core.VERSION,

                            "timingMs" to
                                mapOf(
                                    "total" to
                                        (
                                            android.os.SystemClock.elapsedRealtimeNanos() -
                                                normalizationStartNs
                                        ) / 1_000_000.0,

                                    "imageLoad" to
                                        normalizationImageLoadNs /
                                            1_000_000.0,

                                    "markerDetection" to
                                        markerDetectionNs /
                                            1_000_000.0,

                                    "perspectiveWarp" to
                                        perspectiveWarpNs /
                                            1_000_000.0,

                                    "saveNormalizedImage" to
                                        normalizedSaveNs /
                                            1_000_000.0
                                )
                        )

                    } finally {

                        normalized.release()

                        transform.release()

                        sourcePoints.release()

                        destinationPoints.release()
                    }

                } finally {

                    image.release()
                }
            }

            AsyncFunction(
                "readStudentId50"
            ) { normalizedImageUri: String ->

                ensureOpenCvInitialized()

                val imagePath =
                    uriToPath(
                        normalizedImageUri
                    )

                val image =
                    Imgcodecs.imread(
                        imagePath,
                        Imgcodecs.IMREAD_COLOR
                    )

                if (image.empty()) {
                    image.release()

                    throw Exception(
                        "OpenCV could not load the normalized image for student ID recognition."
                    )
                }

                try {
                    val recognizer =
                        StudentIdRecognizer(
                            appContext.reactContext
                                ?: throw Exception(
                                    "React context unavailable."
                                )
                        )

                    try {
                        val result =
                            recognizer.recognize(
                                image
                            )

                        mapOf(
                            "success" to
                                result.success,

                            "studentId" to
                                result.studentId,

                            "digits" to
                                result.digits.map {
                                    mapOf(
                                        "position" to
                                            it.position,

                                        "digit" to
                                            it.digit,

                                        "confidence" to
                                            it.confidence,

                                        "cropUri" to
                                            it.cropUri,

                                        "binaryUri" to
                                            it.binaryUri,

                                        "modelInputUri" to
                                            it.modelInputUri
                                    )
                                },

                            "minConfidence" to
                                result.minConfidence,

                            "averageConfidence" to
                                result.averageConfidence,

                            "weakPositions" to
                                result.weakPositions
                        )

                    } finally {
                        recognizer.close()
                    }

                } finally {
                    image.release()
                }
            }


            /*
            |--------------------------------------------------------------------------
            | 50-Item Answer-Key Reader
            |--------------------------------------------------------------------------
            |
            | This is intentionally stricter than student-sheet interpretation.
            |
            | The answer-key image is expected to be a normalized canonical
            | 2480x3508 GradeLens sheet. Only calibrated coverage is needed:
            |
            | - exactly one shaded bubble per question
            | - zero invalid bubbles per question
            | - crossed/correction semantics are not used for an answer key
            |
            |--------------------------------------------------------------------------
            */

            /*
            |--------------------------------------------------------------------------
            | Read Answer-Sheet QR
            |--------------------------------------------------------------------------
            |
            | The Laravel answer sheet stores:
            |
            |   {"v":1,"ct":<course-test-id>,"s":"<sheet-uuid>"}
            |
            | Native only decodes the QR text. TypeScript owns payload parsing
            | and validation so the QR contract stays explicit at the app layer.
            |
            |--------------------------------------------------------------------------
            */

            AsyncFunction(
                "readSheetQr50"
            ) { normalizedImageUri: String ->

                val startedNs =
                    android.os.SystemClock.elapsedRealtimeNanos()

                ensureOpenCvInitialized()

                val imagePath =
                    uriToPath(
                        normalizedImageUri
                    )

                val image =
                    Imgcodecs.imread(
                        imagePath,
                        Imgcodecs.IMREAD_COLOR
                    )

                if (
                    image.empty()
                ) {

                    image.release()

                    throw Exception(
                        "OpenCV could not load the normalized image for QR decoding."
                    )
                }

                try {

                    if (
                        image.cols() !=
                            NORMALIZED_WIDTH ||
                        image.rows() !=
                            NORMALIZED_HEIGHT
                    ) {

                        throw Exception(
                            "QR reader requires a normalized " +
                                "${NORMALIZED_WIDTH}x${NORMALIZED_HEIGHT} image."
                        )
                    }

                    /*
                     * Current Laravel AnswerSheetGeometry50:
                     *
                     *   QR_X_MM    = 116.0
                     *   QR_Y_MM    = 7.0
                     *   QR_SIZE_MM = 23.0
                     *
                     * We do not rely on one fragile crop anymore. A phone
                     * capture can leave the QR slightly soft even after the
                     * ArUco perspective normalization, so we try the exact
                     * region first and then increasingly tolerant variants.
                     */
                    fun buildQrCrop(
                        marginMm: Double
                    ): Pair<Mat, Map<String, Int>> {

                        val cropLeftMm =
                            max(
                                0.0,
                                QR_X_MM -
                                    marginMm
                            )

                        val cropTopMm =
                            max(
                                0.0,
                                QR_Y_MM -
                                    marginMm
                            )

                        val cropRightMm =
                            min(
                                SHEET_WIDTH_MM,
                                QR_X_MM +
                                    QR_SIZE_MM +
                                    marginMm
                            )

                        val cropBottomMm =
                            min(
                                SHEET_HEIGHT_MM,
                                QR_Y_MM +
                                    QR_SIZE_MM +
                                    marginMm
                            )

                        val x1 =
                            floor(
                                mmToX(
                                    cropLeftMm
                                )
                            ).toInt()
                                .coerceIn(
                                    0,
                                    NORMALIZED_WIDTH -
                                        1
                                )

                        val y1 =
                            floor(
                                mmToY(
                                    cropTopMm
                                )
                            ).toInt()
                                .coerceIn(
                                    0,
                                    NORMALIZED_HEIGHT -
                                        1
                                )

                        val x2 =
                            ceil(
                                mmToX(
                                    cropRightMm
                                )
                            ).toInt()
                                .coerceIn(
                                    x1 + 1,
                                    NORMALIZED_WIDTH
                                )

                        val y2 =
                            ceil(
                                mmToY(
                                    cropBottomMm
                                )
                            ).toInt()
                                .coerceIn(
                                    y1 + 1,
                                    NORMALIZED_HEIGHT
                                )

                        val crop =
                            image.submat(
                                y1,
                                y2,
                                x1,
                                x2
                            ).clone()

                        return Pair(
                            crop,
                            mapOf(
                                "x" to
                                    x1,

                                "y" to
                                    y1,

                                "width" to
                                    (
                                        x2 -
                                            x1
                                        ),

                                "height" to
                                    (
                                        y2 -
                                            y1
                                        )
                            )
                        )
                    }

                    val detector =
                        QRCodeDetector()

                    var decoded =
                        ""

                    var successfulAttempt =
                        "none"

                    var successfulCrop =
                        mapOf(
                            "x" to 0,
                            "y" to 0,
                            "width" to 0,
                            "height" to 0
                        )

                    val attemptedModes =
                        mutableListOf<String>()

                    /*
                     * Try a crop in several representations:
                     *
                     * 1. original color crop
                     * 2. 2x bicubic upscale
                     * 3. grayscale
                     * 4. Otsu binary
                     *
                     * The first successful decode wins.
                     */
                    fun tryDecodeCrop(
                        marginMm: Double,
                        label: String
                    ) {

                        if (
                            decoded.isNotEmpty()
                        ) {
                            return
                        }

                        val (
                            crop,
                            cropInfo
                        ) =
                            buildQrCrop(
                                marginMm
                            )

                        try {

                            attemptedModes.add(
                                "$label-color"
                            )

                            decoded =
                                detector.detectAndDecode(
                                    crop
                                ).trim()

                            if (
                                decoded.isNotEmpty()
                            ) {
                                successfulAttempt =
                                    "$label-color"

                                successfulCrop =
                                    cropInfo

                                return
                            }

                            val upscaled =
                                Mat()

                            try {

                                Imgproc.resize(
                                    crop,
                                    upscaled,
                                    Size(
                                        crop.cols() *
                                            2.0,

                                        crop.rows() *
                                            2.0
                                    ),
                                    0.0,
                                    0.0,
                                    Imgproc.INTER_CUBIC
                                )

                                attemptedModes.add(
                                    "$label-upscaled"
                                )

                                decoded =
                                    detector.detectAndDecode(
                                        upscaled
                                    ).trim()

                                if (
                                    decoded.isNotEmpty()
                                ) {
                                    successfulAttempt =
                                        "$label-upscaled"

                                    successfulCrop =
                                        cropInfo

                                    return
                                }

                                val gray =
                                    Mat()

                                try {

                                    Imgproc.cvtColor(
                                        upscaled,
                                        gray,
                                        Imgproc.COLOR_BGR2GRAY
                                    )

                                    attemptedModes.add(
                                        "$label-gray"
                                    )

                                    decoded =
                                        detector.detectAndDecode(
                                            gray
                                        ).trim()

                                    if (
                                        decoded.isNotEmpty()
                                    ) {
                                        successfulAttempt =
                                            "$label-gray"

                                        successfulCrop =
                                            cropInfo

                                        return
                                    }

                                    val binary =
                                        Mat()

                                    try {

                                        Imgproc.threshold(
                                            gray,
                                            binary,
                                            0.0,
                                            255.0,
                                            Imgproc.THRESH_BINARY or
                                                Imgproc.THRESH_OTSU
                                        )

                                        attemptedModes.add(
                                            "$label-otsu"
                                        )

                                        decoded =
                                            detector.detectAndDecode(
                                                binary
                                            ).trim()

                                        if (
                                            decoded.isNotEmpty()
                                        ) {
                                            successfulAttempt =
                                                "$label-otsu"

                                            successfulCrop =
                                                cropInfo

                                            return
                                        }

                                    } finally {

                                        binary.release()
                                    }

                                } finally {

                                    gray.release()
                                }

                            } finally {

                                upscaled.release()
                            }

                        } finally {

                            crop.release()
                        }
                    }

                    /*
                     * Exact/current crop first, then progressively larger
                     * quiet-zone margins.
                     */
                    tryDecodeCrop(
                        QR_CROP_MARGIN_MM,
                        "margin4"
                    )

                    tryDecodeCrop(
                        6.0,
                        "margin6"
                    )

                    tryDecodeCrop(
                        8.0,
                        "margin8"
                    )

                    /*
                     * Final fallback: decode the full normalized header area.
                     * This still remains much smaller than scanning the whole
                     * 2480x3508 image and gives OpenCV additional context when
                     * the QR crop itself is difficult.
                     */
                    if (
                        decoded.isEmpty()
                    ) {

                        val headerLeft =
                            floor(
                                mmToX(
                                    105.0
                                )
                            ).toInt()
                                .coerceAtLeast(
                                    0
                                )

                        val headerTop =
                            floor(
                                mmToY(
                                    2.0
                                )
                            ).toInt()
                                .coerceAtLeast(
                                    0
                                )

                        val headerRight =
                            ceil(
                                mmToX(
                                    146.0
                                )
                            ).toInt()
                                .coerceAtMost(
                                    NORMALIZED_WIDTH
                                )

                        val headerBottom =
                            ceil(
                                mmToY(
                                    36.0
                                )
                            ).toInt()
                                .coerceAtMost(
                                    NORMALIZED_HEIGHT
                                )

                        val headerCrop =
                            image.submat(
                                headerTop,
                                headerBottom,
                                headerLeft,
                                headerRight
                            ).clone()

                        try {

                            attemptedModes.add(
                                "header-color"
                            )

                            decoded =
                                detector.detectAndDecode(
                                    headerCrop
                                ).trim()

                            if (
                                decoded.isNotEmpty()
                            ) {
                                successfulAttempt =
                                    "header-color"

                                successfulCrop =
                                    mapOf(
                                        "x" to
                                            headerLeft,

                                        "y" to
                                            headerTop,

                                        "width" to
                                            (
                                                headerRight -
                                                    headerLeft
                                                ),

                                        "height" to
                                            (
                                                headerBottom -
                                                    headerTop
                                                )
                                    )
                            }

                        } finally {

                            headerCrop.release()
                        }
                    }

                    val totalMs =
                        (
                            android.os.SystemClock.elapsedRealtimeNanos() -
                                startedNs
                            ) /
                            1_000_000.0

                    Log.d(
                        TAG,
                        "QR decode: " +
                            "success=${decoded.isNotEmpty()}, " +
                            "attempt=$successfulAttempt, " +
                            "attempted=$attemptedModes"
                    )

                    mapOf(
                        "success" to
                            decoded.isNotEmpty(),

                        "rawValue" to
                            decoded,

                        "crop" to
                            successfulCrop,

                        "attempt" to
                            successfulAttempt,

                        "attemptedModes" to
                            attemptedModes,

                        "timingMs" to
                            totalMs
                    )

                } finally {

                    image.release()
                }
            }


            AsyncFunction(
                "readAnswerKey50"
            ) { normalizedImageUri: String ->

                ensureOpenCvInitialized()

                val imagePath =
                    uriToPath(
                        normalizedImageUri
                    )

                Log.d(
                    TAG,
                    "Reading strict 50-item answer key: $imagePath"
                )

                val image =
                    Imgcodecs.imread(
                        imagePath,
                        Imgcodecs.IMREAD_COLOR
                    )

                if (
                    image.empty()
                ) {

                    image.release()

                    throw Exception(
                        "OpenCV could not load the answer-key image."
                    )
                }

                val gray =
                    Mat()

                try {

                    if (
                        image.cols() !=
                            NORMALIZED_WIDTH ||
                        image.rows() !=
                            NORMALIZED_HEIGHT
                    ) {

                        throw Exception(
                            "Answer-key reader requires a normalized " +
                                "${NORMALIZED_WIDTH}x${NORMALIZED_HEIGHT} image."
                        )
                    }

                    Imgproc.cvtColor(
                        image,
                        gray,
                        Imgproc.COLOR_BGR2GRAY
                    )

                    val answers =
                        mutableMapOf<String, List<String>>()

                    val invalidQuestionNumbers =
                        mutableListOf<Int>()

                    val questions =
                        mutableListOf<Map<String, Any?>>()

                    var shadedBubbleCount =
                        0

                    var invalidBubbleCount =
                        0

                    for (
                        question in
                        1..QUESTION_COUNT_50
                    ) {

                        val shadedChoices =
                            mutableListOf<String>()

                        val invalidChoices =
                            mutableListOf<String>()

                        val bubbles =
                            mutableListOf<Map<String, Any>>()

                        for (
                            choiceIndex in
                            0 until 5
                        ) {

                            val choice =
                                ('A'.code +
                                    choiceIndex)
                                    .toChar()
                                    .toString()

                            val center =
                                getBubbleCenter50(
                                    question =
                                        question,

                                    choiceIndex =
                                        choiceIndex
                                )

                            val measurement =
                                measureCoverage(
                                    gray =
                                        gray,

                                    centerX =
                                        center.x,

                                    centerY =
                                        center.y
                                )

                            val role =
                                classifyCoverage(
                                    measurement.coverage
                                )

                            when (
                                role
                            ) {

                                "shaded" -> {
                                    shadedChoices.add(
                                        choice
                                    )

                                    shadedBubbleCount++
                                }

                                "invalid" -> {
                                    invalidChoices.add(
                                        choice
                                    )

                                    invalidBubbleCount++
                                }
                            }

                            bubbles.add(
                                mapOf(
                                    "choice" to
                                        choice,

                                    "coverage" to
                                        measurement.coverage,

                                    "role" to
                                        role,

                                    "backgroundMedian" to
                                        measurement.backgroundMedian,

                                    "darkThreshold" to
                                        measurement.darkThreshold
                                )
                            )
                        }

                        val valid =
                            (
                                shadedChoices.isNotEmpty() &&
                                invalidChoices.isEmpty()
                            )

                        val answer =
                            if (
                                valid
                            ) {

                                shadedChoices.toList()

                            } else {

                                emptyList<String>()
                            }

                        if (
                            valid
                        ) {

                            answers[
                                question.toString()
                            ] =
                                answer

                        } else {

                            invalidQuestionNumbers.add(
                                question
                            )
                        }

                        questions.add(
                            mapOf(
                                "question" to
                                    question,

                                "answer" to
                                    answer,

                                "valid" to
                                    valid,

                                "shadedChoices" to
                                    shadedChoices,

                                "invalidChoices" to
                                    invalidChoices,

                                "bubbles" to
                                    bubbles
                            )
                        )
                    }

                    val success =
                        invalidQuestionNumbers.isEmpty() &&
                            answers.size ==
                                QUESTION_COUNT_50

                    Log.d(
                        TAG,
                        "Answer-key reader complete: " +
                            "success=$success, " +
                            "answers=${answers.size}, " +
                            "invalidQuestions=$invalidQuestionNumbers"
                    )

                    mapOf(
                        "success" to
                            success,

                        "questionCount" to
                            QUESTION_COUNT_50,

                        "answerCount" to
                            answers.size,

                        "shadedBubbleCount" to
                            shadedBubbleCount,

                        "invalidBubbleCount" to
                            invalidBubbleCount,

                        "invalidQuestionNumbers" to
                            invalidQuestionNumbers,

                        "answers" to
                            answers,

                        "questions" to
                            questions
                    )

                } finally {

                    gray.release()

                    image.release()
                }
            }

            /*
            |--------------------------------------------------------------------------
            | 100-Item Answer-Key Reader
            |--------------------------------------------------------------------------
            |
            | Same strict rule as the 50-item reader:
            | - at least one shaded choice is allowed (multi-answer keys)
            | - no invalid bubble may exist in the question
            | - every one of the 100 questions must produce an answer
            |--------------------------------------------------------------------------
            */

            AsyncFunction(
                "readAnswerKey100"
            ) { normalizedImageUri: String ->

                ensureOpenCvInitialized()

                val imagePath =
                    uriToPath(
                        normalizedImageUri
                    )

                Log.d(
                    TAG,
                    "Reading strict 50-item answer key: $imagePath"
                )

                val image =
                    Imgcodecs.imread(
                        imagePath,
                        Imgcodecs.IMREAD_COLOR
                    )

                if (
                    image.empty()
                ) {

                    image.release()

                    throw Exception(
                        "OpenCV could not load the answer-key image."
                    )
                }

                val gray =
                    Mat()

                try {

                    if (
                        image.cols() !=
                            NORMALIZED_WIDTH ||
                        image.rows() !=
                            NORMALIZED_HEIGHT
                    ) {

                        throw Exception(
                            "Answer-key reader requires a normalized " +
                                "${NORMALIZED_WIDTH}x${NORMALIZED_HEIGHT} image."
                        )
                    }

                    Imgproc.cvtColor(
                        image,
                        gray,
                        Imgproc.COLOR_BGR2GRAY
                    )

                    val answers =
                        mutableMapOf<String, List<String>>()

                    val invalidQuestionNumbers =
                        mutableListOf<Int>()

                    val questions =
                        mutableListOf<Map<String, Any?>>()

                    var shadedBubbleCount =
                        0

                    var invalidBubbleCount =
                        0

                    for (
                        question in
                        1..QUESTION_COUNT_100
                    ) {

                        val shadedChoices =
                            mutableListOf<String>()

                        val invalidChoices =
                            mutableListOf<String>()

                        val bubbles =
                            mutableListOf<Map<String, Any>>()

                        for (
                            choiceIndex in
                            0 until 5
                        ) {

                            val choice =
                                ('A'.code +
                                    choiceIndex)
                                    .toChar()
                                    .toString()

                            val center =
                                getBubbleCenter100(
                                    question =
                                        question,

                                    choiceIndex =
                                        choiceIndex
                                )

                            val measurement =
                                measureCoverage(
                                    gray =
                                        gray,

                                    centerX =
                                        center.x,

                                    centerY =
                                        center.y
                                )

                            val role =
                                classifyCoverage(
                                    measurement.coverage
                                )

                            when (
                                role
                            ) {

                                "shaded" -> {
                                    shadedChoices.add(
                                        choice
                                    )

                                    shadedBubbleCount++
                                }

                                "invalid" -> {
                                    invalidChoices.add(
                                        choice
                                    )

                                    invalidBubbleCount++
                                }
                            }

                            bubbles.add(
                                mapOf(
                                    "choice" to
                                        choice,

                                    "coverage" to
                                        measurement.coverage,

                                    "role" to
                                        role,

                                    "backgroundMedian" to
                                        measurement.backgroundMedian,

                                    "darkThreshold" to
                                        measurement.darkThreshold
                                )
                            )
                        }

                        val valid =
                            (
                                shadedChoices.isNotEmpty() &&
                                invalidChoices.isEmpty()
                            )

                        val answer =
                            if (
                                valid
                            ) {

                                shadedChoices.toList()

                            } else {

                                emptyList<String>()
                            }

                        if (
                            valid
                        ) {

                            answers[
                                question.toString()
                            ] =
                                answer

                        } else {

                            invalidQuestionNumbers.add(
                                question
                            )
                        }

                        questions.add(
                            mapOf(
                                "question" to
                                    question,

                                "answer" to
                                    answer,

                                "valid" to
                                    valid,

                                "shadedChoices" to
                                    shadedChoices,

                                "invalidChoices" to
                                    invalidChoices,

                                "bubbles" to
                                    bubbles
                            )
                        )
                    }

                    val success =
                        invalidQuestionNumbers.isEmpty() &&
                            answers.size ==
                                QUESTION_COUNT_100

                    Log.d(
                        TAG,
                        "Answer-key reader complete: " +
                            "success=$success, " +
                            "answers=${answers.size}, " +
                            "invalidQuestions=$invalidQuestionNumbers"
                    )

                    mapOf(
                        "success" to
                            success,

                        "questionCount" to
                            QUESTION_COUNT_100,

                        "answerCount" to
                            answers.size,

                        "shadedBubbleCount" to
                            shadedBubbleCount,

                        "invalidBubbleCount" to
                            invalidBubbleCount,

                        "invalidQuestionNumbers" to
                            invalidQuestionNumbers,

                        "answers" to
                            answers,

                        "questions" to
                            questions
                    )

                } finally {

                    gray.release()

                    image.release()
                }
            }

            /*
            |--------------------------------------------------------------------------
            | 50-Item Question Interpreter
            |--------------------------------------------------------------------------
            |
            | Converts five frozen hybrid bubble roles into one interpreted
            | question result.
            |
            | Rules:
            |
            | 1. >= 3 invalid bubbles
            |       -> unreadable / reject
            |
            | 2. no shaded and no crossed
            |       -> blank
            |
            | 3. no shaded and >= 1 crossed
            |       -> crossed_without_replacement
            |
            | 4. exactly 1 shaded
            |       -> selected
            |       -> selected_with_correction when crossed bubbles also exist
            |
            | 5. >= 2 shaded
            |       -> multiple
            |
            | Any question containing one or more invalid bubbles is marked
            | for review unless it already falls under unreadable.
            |
            |--------------------------------------------------------------------------
            */

            AsyncFunction(
                "analyze50Questions"
            ) { normalizedImageUri: String ->

                val analysisStartNs =
                    android.os.SystemClock.elapsedRealtimeNanos()

                ensureOpenCvInitialized()

                val imagePath =
                    uriToPath(
                        normalizedImageUri
                    )

                Log.d(
                    TAG,
                    "Running 50-item hybrid question interpreter: $imagePath"
                )

                val analysisImageLoadStartNs =
                    android.os.SystemClock.elapsedRealtimeNanos()

                val image =
                    Imgcodecs.imread(
                        imagePath,
                        Imgcodecs.IMREAD_COLOR
                    )

                val analysisImageLoadNs =
                    android.os.SystemClock.elapsedRealtimeNanos() -
                        analysisImageLoadStartNs

                if (
                    image.empty()
                ) {

                    image.release()

                    throw Exception(
                        "OpenCV could not load the normalized image."
                    )
                }

                val gray =
                    Mat()

                try {

                    if (
                        image.cols() !=
                            NORMALIZED_WIDTH ||
                        image.rows() !=
                            NORMALIZED_HEIGHT
                    ) {

                        throw Exception(
                            "Question interpreter requires a normalized " +
                                "${NORMALIZED_WIDTH}x${NORMALIZED_HEIGHT} image."
                        )
                    }

                    val grayscaleStartNs =
                        android.os.SystemClock.elapsedRealtimeNanos()

                    Imgproc.cvtColor(
                        image,
                        gray,
                        Imgproc.COLOR_BGR2GRAY
                    )

                    val grayscaleNs =
                        android.os.SystemClock.elapsedRealtimeNanos() -
                            grayscaleStartNs

                    val cropSize =
                        86

                    val halfCrop =
                        cropSize /
                            2

                    val androidContext =
                        appContext.reactContext
                            ?: throw Exception(
                                "Android React context is unavailable."
                            )

                    val crossAnalyzer =
                        CrossAnalyzer()

                    val questions =
                        mutableListOf<Map<String, Any?>>()

                    val statusCounts =
                        mutableMapOf(
                            "blank" to 0,
                            "selected" to 0,
                            "selected_with_correction" to 0,
                            "crossed_without_replacement" to 0,
                            "multiple" to 0,
                            "ambiguous" to 0,
                            "unreadable" to 0,
                        )

                    var acceptedCount =
                        0

                    var reviewCount =
                        0

                    var rejectCount =
                        0

                    var interpretedQuestionCount =
                        0

                    var cropNs =
                        0L

                    var cnnNs =
                        0L

                    var coverageNs =
                        0L

                    var crossNs =
                        0L

                    var crossExecutedCount =
                        0

                    var crossSkippedCount =
                        0

                    var resolverNs =
                        0L

                    var interpreterNs =
                        0L

                    val classifierInitStartNs =
                        android.os.SystemClock.elapsedRealtimeNanos()

                    val classifier =
                        BubbleClassifier(
                            androidContext
                        )

                    val classifierInitNs =
                        android.os.SystemClock.elapsedRealtimeNanos() -
                            classifierInitStartNs

                    classifier.use {

                        for (
                            question in
                            1..QUESTION_COUNT_50
                        ) {

                            val bubbleRows =
                                mutableListOf<Map<String, Any>>()

                            val shadedChoices =
                                mutableListOf<String>()

                            val crossedChoices =
                                mutableListOf<String>()

                            val invalidChoices =
                                mutableListOf<String>()

                            for (
                                choiceIndex in
                                0 until 5
                            ) {

                                val choice =
                                    ('A'.code +
                                        choiceIndex)
                                        .toChar()
                                        .toString()

                                val center =
                                    getBubbleCenter50(
                                        question =
                                            question,

                                        choiceIndex =
                                            choiceIndex
                                    )

                                val cropX =
                                    center.x.toInt() -
                                        halfCrop

                                val cropY =
                                    center.y.toInt() -
                                        halfCrop

                                if (
                                    cropX < 0 ||
                                    cropY < 0 ||
                                    cropX + cropSize >
                                        image.cols() ||
                                    cropY + cropSize >
                                        image.rows()
                                ) {

                                    throw Exception(
                                        "Classifier crop is outside image bounds for " +
                                            "Q$question-$choice."
                                    )
                                }

                                val cropStartNs =
                                    android.os.SystemClock.elapsedRealtimeNanos()

                                val crop =
                                    Mat(
                                        image,
                                        org.opencv.core.Rect(
                                            cropX,
                                            cropY,
                                            cropSize,
                                            cropSize
                                        )
                                    ).clone()

                                cropNs +=
                                    android.os.SystemClock.elapsedRealtimeNanos() -
                                        cropStartNs

                                try {

                                    val cnnStartNs =
                                        android.os.SystemClock.elapsedRealtimeNanos()

                                    val prediction =
                                        classifier.predict(
                                            crop
                                        )

                                    cnnNs +=
                                        android.os.SystemClock.elapsedRealtimeNanos() -
                                            cnnStartNs

                                    val coverageStartNs =
                                        android.os.SystemClock.elapsedRealtimeNanos()

                                    val coverageMeasurement =
                                        measureCoverage(
                                            gray =
                                                gray,

                                            centerX =
                                                center.x,

                                            centerY =
                                                center.y
                                        )

                                    coverageNs +=
                                        android.os.SystemClock.elapsedRealtimeNanos() -
                                            coverageStartNs

                                    val coverageRole =
                                        classifyCoverage(
                                            coverageMeasurement.coverage
                                        )

                                    /*
                                     * Performance optimization:
                                     *
                                     * If BOTH the CNN and calibrated coverage agree that
                                     * this bubble is clearly unshaded, we can safely keep
                                     * the final role as unshaded without running the much
                                     * more expensive geometric cross detector.
                                     *
                                     * Any marked, invalid, or disagreement case still runs
                                     * the full cross detector and frozen hybrid resolver.
                                     */
                                    val canSkipCross =
                                        (
                                            prediction.label ==
                                                "Unshaded_Bubble" &&
                                            coverageRole ==
                                                "unshaded"
                                        )

                                    val crossScore: Double
                                    val crossState: String

                                    val resolverStartNs =
                                        android.os.SystemClock.elapsedRealtimeNanos()

                                    val finalRole =
                                        if (
                                            canSkipCross
                                        ) {

                                            crossSkippedCount++

                                            crossScore =
                                                0.0

                                            crossState =
                                                "skipped_unshaded"

                                            "unshaded"

                                        } else {

                                            val crossStartNs =
                                                android.os.SystemClock.elapsedRealtimeNanos()

                                            val crossResult =
                                                crossAnalyzer.analyze(
                                                    normalizedImage =
                                                        image,

                                                    centerX =
                                                        center.x,

                                                    centerY =
                                                        center.y
                                                )

                                            crossNs +=
                                                android.os.SystemClock.elapsedRealtimeNanos() -
                                                    crossStartNs

                                            crossExecutedCount++

                                            crossScore =
                                                crossResult.crossScore

                                            crossState =
                                                crossResult.crossState

                                            resolveHybridBubbleRole(
                                                cnnLabel =
                                                    prediction.label,

                                                coverageRole =
                                                    coverageRole,

                                                crossState =
                                                    crossState
                                            )
                                        }

                                    resolverNs +=
                                        android.os.SystemClock.elapsedRealtimeNanos() -
                                            resolverStartNs

                                    when (
                                        finalRole
                                    ) {

                                        "shaded" ->
                                            shadedChoices.add(
                                                choice
                                            )

                                        "crossed" ->
                                            crossedChoices.add(
                                                choice
                                            )

                                        "invalid" ->
                                            invalidChoices.add(
                                                choice
                                            )
                                    }

                                    bubbleRows.add(
                                        mapOf(
                                            "choice" to
                                                choice,

                                            "finalRole" to
                                                finalRole,

                                            "cnnLabel" to
                                                prediction.label,

                                            "cnnConfidence" to
                                                prediction.confidence.toDouble(),

                                            "coverage" to
                                                coverageMeasurement.coverage,

                                            "coverageRole" to
                                                coverageRole,

                                            "crossScore" to
                                                crossScore,

                                            "crossState" to
                                                crossState
                                        )
                                    )

                                } finally {

                                    crop.release()
                                }
                            }

                            val interpreterStartNs =
                                android.os.SystemClock.elapsedRealtimeNanos()

                            val interpretation =
                                interpretHybridQuestion(
                                    shadedChoices =
                                        shadedChoices,

                                    crossedChoices =
                                        crossedChoices,

                                    invalidChoices =
                                        invalidChoices
                                )

                            interpreterNs +=
                                android.os.SystemClock.elapsedRealtimeNanos() -
                                    interpreterStartNs

                            statusCounts[
                                interpretation.status
                            ] =
                                (
                                    statusCounts[
                                        interpretation.status
                                    ] ?: 0
                                ) + 1

                            when (
                                interpretation.qualityStatus
                            ) {

                                "accepted" ->
                                    acceptedCount++

                                "review" ->
                                    reviewCount++

                                "reject" ->
                                    rejectCount++
                            }

                            interpretedQuestionCount++

                            questions.add(
                                mapOf(
                                    "question" to
                                        question,

                                    "answer" to
                                        interpretation.answer,

                                    "status" to
                                        interpretation.status,

                                    "qualityStatus" to
                                        interpretation.qualityStatus,

                                    "needsReview" to
                                        interpretation.needsReview,

                                    "shadedChoices" to
                                        shadedChoices,

                                    "crossedChoices" to
                                        crossedChoices,

                                    "invalidChoices" to
                                        invalidChoices,

                                    "bubbles" to
                                        bubbleRows
                                )
                            )
                        }
                    }

                    val classifierTiming =
                        classifier
                            .timingSnapshot()
                            .asMilliseconds()

                    val crossTiming =
                        crossAnalyzer
                            .timingSnapshot()
                            .asMilliseconds()

                    if (
                        interpretedQuestionCount !=
                            QUESTION_COUNT_50
                    ) {

                        throw Exception(
                            "Question interpreter count mismatch. Expected " +
                                "$QUESTION_COUNT_50 but received " +
                                "$interpretedQuestionCount."
                        )
                    }

                    Log.d(
                        TAG,
                        "Question interpreter complete: " +
                            "status=$statusCounts, " +
                            "accepted=$acceptedCount, " +
                            "review=$reviewCount, " +
                            "reject=$rejectCount"
                    )

                    mapOf(
                        "success" to
                            true,

                        "questionCount" to
                            QUESTION_COUNT_50,

                        "cropSize" to
                            cropSize,

                        "statusCounts" to
                            statusCounts,

                        "acceptedCount" to
                            acceptedCount,

                        "reviewCount" to
                            reviewCount,

                        "rejectCount" to
                            rejectCount,

                        "crossExecutedCount" to
                            crossExecutedCount,

                        "crossSkippedCount" to
                            crossSkippedCount,

                        "cnnProfileMs" to
                            classifierTiming,

                        "crossProfileMs" to
                            crossTiming,

                        "timingMs" to
                            mapOf(
                                "total" to
                                    (
                                        android.os.SystemClock.elapsedRealtimeNanos() -
                                            analysisStartNs
                                    ) / 1_000_000.0,

                                "imageLoad" to
                                    analysisImageLoadNs /
                                        1_000_000.0,

                                "grayscale" to
                                    grayscaleNs /
                                        1_000_000.0,

                                "classifierInit" to
                                    classifierInitNs /
                                        1_000_000.0,

                                "crop" to
                                    cropNs /
                                        1_000_000.0,

                                "cnn" to
                                    cnnNs /
                                        1_000_000.0,

                                "coverage" to
                                    coverageNs /
                                        1_000_000.0,

                                "cross" to
                                    crossNs /
                                        1_000_000.0,

                                "resolver" to
                                    resolverNs /
                                        1_000_000.0,

                                "interpreter" to
                                    interpreterNs /
                                        1_000_000.0
                            ),

                        "questions" to
                            questions
                    )

                } finally {

                    gray.release()

                    image.release()
                }
            }
            /*
            |--------------------------------------------------------------------------
            | 100-Item Question Interpreter
            |--------------------------------------------------------------------------
            |
            | This is the 100-item counterpart of the frozen 50-item hybrid
            | pipeline. Only geometry/question count are different:
            |
            |   CNN -> coverage -> optional cross -> frozen resolver
            |       -> frozen question interpretation
            |
            | A clear CNN+coverage unshaded agreement still skips the cross
            | detector for performance.
            |--------------------------------------------------------------------------
            */

            AsyncFunction(
                "analyze100Questions"
            ) { normalizedImageUri: String ->

                val analysisStartNs =
                    android.os.SystemClock.elapsedRealtimeNanos()

                ensureOpenCvInitialized()

                val imagePath =
                    uriToPath(
                        normalizedImageUri
                    )

                Log.d(
                    TAG,
                    "Running 100-item hybrid question interpreter: $imagePath"
                )

                val analysisImageLoadStartNs =
                    android.os.SystemClock.elapsedRealtimeNanos()

                val image =
                    Imgcodecs.imread(
                        imagePath,
                        Imgcodecs.IMREAD_COLOR
                    )

                val analysisImageLoadNs =
                    android.os.SystemClock.elapsedRealtimeNanos() -
                        analysisImageLoadStartNs

                if (
                    image.empty()
                ) {

                    image.release()

                    throw Exception(
                        "OpenCV could not load the normalized image."
                    )
                }

                val gray =
                    Mat()

                try {

                    if (
                        image.cols() !=
                            NORMALIZED_WIDTH ||
                        image.rows() !=
                            NORMALIZED_HEIGHT
                    ) {

                        throw Exception(
                            "Question interpreter requires a normalized " +
                                "${NORMALIZED_WIDTH}x${NORMALIZED_HEIGHT} image."
                        )
                    }

                    val grayscaleStartNs =
                        android.os.SystemClock.elapsedRealtimeNanos()

                    Imgproc.cvtColor(
                        image,
                        gray,
                        Imgproc.COLOR_BGR2GRAY
                    )

                    val grayscaleNs =
                        android.os.SystemClock.elapsedRealtimeNanos() -
                            grayscaleStartNs

                    val cropSize =
                        86

                    val halfCrop =
                        cropSize /
                            2

                    val androidContext =
                        appContext.reactContext
                            ?: throw Exception(
                                "Android React context is unavailable."
                            )

                    val crossAnalyzer =
                        CrossAnalyzer()

                    val questions =
                        mutableListOf<Map<String, Any?>>()

                    val statusCounts =
                        mutableMapOf(
                            "blank" to 0,
                            "selected" to 0,
                            "selected_with_correction" to 0,
                            "crossed_without_replacement" to 0,
                            "multiple" to 0,
                            "ambiguous" to 0,
                            "unreadable" to 0,
                        )

                    var acceptedCount =
                        0

                    var reviewCount =
                        0

                    var rejectCount =
                        0

                    var interpretedQuestionCount =
                        0

                    var cropNs =
                        0L

                    var cnnNs =
                        0L

                    var coverageNs =
                        0L

                    var crossNs =
                        0L

                    var crossExecutedCount =
                        0

                    var crossSkippedCount =
                        0

                    var resolverNs =
                        0L

                    var interpreterNs =
                        0L

                    val classifierInitStartNs =
                        android.os.SystemClock.elapsedRealtimeNanos()

                    val classifier =
                        BubbleClassifier(
                            androidContext
                        )

                    val classifierInitNs =
                        android.os.SystemClock.elapsedRealtimeNanos() -
                            classifierInitStartNs

                    classifier.use {

                        for (
                            question in
                            1..QUESTION_COUNT_100
                        ) {

                            val bubbleRows =
                                mutableListOf<Map<String, Any>>()

                            val shadedChoices =
                                mutableListOf<String>()

                            val crossedChoices =
                                mutableListOf<String>()

                            val invalidChoices =
                                mutableListOf<String>()

                            for (
                                choiceIndex in
                                0 until 5
                            ) {

                                val choice =
                                    ('A'.code +
                                        choiceIndex)
                                        .toChar()
                                        .toString()

                                val center =
                                    getBubbleCenter100(
                                        question =
                                            question,

                                        choiceIndex =
                                            choiceIndex
                                    )

                                val cropX =
                                    center.x.toInt() -
                                        halfCrop

                                val cropY =
                                    center.y.toInt() -
                                        halfCrop

                                if (
                                    cropX < 0 ||
                                    cropY < 0 ||
                                    cropX + cropSize >
                                        image.cols() ||
                                    cropY + cropSize >
                                        image.rows()
                                ) {

                                    throw Exception(
                                        "Classifier crop is outside image bounds for " +
                                            "Q$question-$choice."
                                    )
                                }

                                val cropStartNs =
                                    android.os.SystemClock.elapsedRealtimeNanos()

                                val crop =
                                    Mat(
                                        image,
                                        org.opencv.core.Rect(
                                            cropX,
                                            cropY,
                                            cropSize,
                                            cropSize
                                        )
                                    ).clone()

                                cropNs +=
                                    android.os.SystemClock.elapsedRealtimeNanos() -
                                        cropStartNs

                                try {

                                    val cnnStartNs =
                                        android.os.SystemClock.elapsedRealtimeNanos()

                                    val prediction =
                                        classifier.predict(
                                            crop
                                        )

                                    cnnNs +=
                                        android.os.SystemClock.elapsedRealtimeNanos() -
                                            cnnStartNs

                                    val coverageStartNs =
                                        android.os.SystemClock.elapsedRealtimeNanos()

                                    val coverageMeasurement =
                                        measureCoverage(
                                            gray =
                                                gray,

                                            centerX =
                                                center.x,

                                            centerY =
                                                center.y
                                        )

                                    coverageNs +=
                                        android.os.SystemClock.elapsedRealtimeNanos() -
                                            coverageStartNs

                                    val coverageRole =
                                        classifyCoverage(
                                            coverageMeasurement.coverage
                                        )

                                    /*
                                     * Performance optimization:
                                     *
                                     * If BOTH the CNN and calibrated coverage agree that
                                     * this bubble is clearly unshaded, we can safely keep
                                     * the final role as unshaded without running the much
                                     * more expensive geometric cross detector.
                                     *
                                     * Any marked, invalid, or disagreement case still runs
                                     * the full cross detector and frozen hybrid resolver.
                                     */
                                    val canSkipCross =
                                        (
                                            prediction.label ==
                                                "Unshaded_Bubble" &&
                                            coverageRole ==
                                                "unshaded"
                                        )

                                    val crossScore: Double
                                    val crossState: String

                                    val resolverStartNs =
                                        android.os.SystemClock.elapsedRealtimeNanos()

                                    val finalRole =
                                        if (
                                            canSkipCross
                                        ) {

                                            crossSkippedCount++

                                            crossScore =
                                                0.0

                                            crossState =
                                                "skipped_unshaded"

                                            "unshaded"

                                        } else {

                                            val crossStartNs =
                                                android.os.SystemClock.elapsedRealtimeNanos()

                                            val crossResult =
                                                crossAnalyzer.analyze(
                                                    normalizedImage =
                                                        image,

                                                    centerX =
                                                        center.x,

                                                    centerY =
                                                        center.y
                                                )

                                            crossNs +=
                                                android.os.SystemClock.elapsedRealtimeNanos() -
                                                    crossStartNs

                                            crossExecutedCount++

                                            crossScore =
                                                crossResult.crossScore

                                            crossState =
                                                crossResult.crossState

                                            resolveHybridBubbleRole(
                                                cnnLabel =
                                                    prediction.label,

                                                coverageRole =
                                                    coverageRole,

                                                crossState =
                                                    crossState
                                            )
                                        }

                                    resolverNs +=
                                        android.os.SystemClock.elapsedRealtimeNanos() -
                                            resolverStartNs

                                    when (
                                        finalRole
                                    ) {

                                        "shaded" ->
                                            shadedChoices.add(
                                                choice
                                            )

                                        "crossed" ->
                                            crossedChoices.add(
                                                choice
                                            )

                                        "invalid" ->
                                            invalidChoices.add(
                                                choice
                                            )
                                    }

                                    bubbleRows.add(
                                        mapOf(
                                            "choice" to
                                                choice,

                                            "finalRole" to
                                                finalRole,

                                            "cnnLabel" to
                                                prediction.label,

                                            "cnnConfidence" to
                                                prediction.confidence.toDouble(),

                                            "coverage" to
                                                coverageMeasurement.coverage,

                                            "coverageRole" to
                                                coverageRole,

                                            "crossScore" to
                                                crossScore,

                                            "crossState" to
                                                crossState
                                        )
                                    )

                                } finally {

                                    crop.release()
                                }
                            }

                            val interpreterStartNs =
                                android.os.SystemClock.elapsedRealtimeNanos()

                            val interpretation =
                                interpretHybridQuestion(
                                    shadedChoices =
                                        shadedChoices,

                                    crossedChoices =
                                        crossedChoices,

                                    invalidChoices =
                                        invalidChoices
                                )

                            interpreterNs +=
                                android.os.SystemClock.elapsedRealtimeNanos() -
                                    interpreterStartNs

                            statusCounts[
                                interpretation.status
                            ] =
                                (
                                    statusCounts[
                                        interpretation.status
                                    ] ?: 0
                                ) + 1

                            when (
                                interpretation.qualityStatus
                            ) {

                                "accepted" ->
                                    acceptedCount++

                                "review" ->
                                    reviewCount++

                                "reject" ->
                                    rejectCount++
                            }

                            interpretedQuestionCount++

                            questions.add(
                                mapOf(
                                    "question" to
                                        question,

                                    "answer" to
                                        interpretation.answer,

                                    "status" to
                                        interpretation.status,

                                    "qualityStatus" to
                                        interpretation.qualityStatus,

                                    "needsReview" to
                                        interpretation.needsReview,

                                    "shadedChoices" to
                                        shadedChoices,

                                    "crossedChoices" to
                                        crossedChoices,

                                    "invalidChoices" to
                                        invalidChoices,

                                    "bubbles" to
                                        bubbleRows
                                )
                            )
                        }
                    }

                    val classifierTiming =
                        classifier
                            .timingSnapshot()
                            .asMilliseconds()

                    val crossTiming =
                        crossAnalyzer
                            .timingSnapshot()
                            .asMilliseconds()

                    if (
                        interpretedQuestionCount !=
                            QUESTION_COUNT_100
                    ) {

                        throw Exception(
                            "Question interpreter count mismatch. Expected " +
                                "$QUESTION_COUNT_100 but received " +
                                "$interpretedQuestionCount."
                        )
                    }

                    Log.d(
                        TAG,
                        "Question interpreter complete: " +
                            "status=$statusCounts, " +
                            "accepted=$acceptedCount, " +
                            "review=$reviewCount, " +
                            "reject=$rejectCount"
                    )

                    mapOf(
                        "success" to
                            true,

                        "questionCount" to
                            QUESTION_COUNT_100,

                        "cropSize" to
                            cropSize,

                        "statusCounts" to
                            statusCounts,

                        "acceptedCount" to
                            acceptedCount,

                        "reviewCount" to
                            reviewCount,

                        "rejectCount" to
                            rejectCount,

                        "crossExecutedCount" to
                            crossExecutedCount,

                        "crossSkippedCount" to
                            crossSkippedCount,

                        "cnnProfileMs" to
                            classifierTiming,

                        "crossProfileMs" to
                            crossTiming,

                        "timingMs" to
                            mapOf(
                                "total" to
                                    (
                                        android.os.SystemClock.elapsedRealtimeNanos() -
                                            analysisStartNs
                                    ) / 1_000_000.0,

                                "imageLoad" to
                                    analysisImageLoadNs /
                                        1_000_000.0,

                                "grayscale" to
                                    grayscaleNs /
                                        1_000_000.0,

                                "classifierInit" to
                                    classifierInitNs /
                                        1_000_000.0,

                                "crop" to
                                    cropNs /
                                        1_000_000.0,

                                "cnn" to
                                    cnnNs /
                                        1_000_000.0,

                                "coverage" to
                                    coverageNs /
                                        1_000_000.0,

                                "cross" to
                                    crossNs /
                                        1_000_000.0,

                                "resolver" to
                                    resolverNs /
                                        1_000_000.0,

                                "interpreter" to
                                    interpreterNs /
                                        1_000_000.0
                            ),

                        "questions" to
                            questions
                    )

                } finally {

                    gray.release()

                    image.release()
                }
            }
        }

    /*
    |--------------------------------------------------------------------------
    | Hybrid Bubble Role Resolver
    |--------------------------------------------------------------------------
    */

    private fun resolveHybridBubbleRole(
        cnnLabel: String,
        coverageRole: String,
        crossState: String
    ): String {

        /*
         * Rule 1:
         * A definite geometric cross has highest priority.
         */
        if (
            crossState ==
                "definite_cross"
        ) {

            return "crossed"
        }

        /*
         * Rule 2:
         * Physical coverage in the calibrated middle band is invalid.
         */
        if (
            coverageRole ==
                "invalid"
        ) {

            return "invalid"
        }

        /*
         * Rule 3:
         * CNN and coverage agree on a valid shade.
         */
        if (
            cnnLabel ==
                "Shaded_Bubble" &&
            coverageRole ==
                "shaded"
        ) {

            return "shaded"
        }

        /*
         * Rule 4:
         * CNN and coverage agree on an unshaded bubble.
         */
        if (
            cnnLabel ==
                "Unshaded_Bubble" &&
            coverageRole ==
                "unshaded"
        ) {

            return "unshaded"
        }

        /*
         * Rule 5:
         * Every remaining disagreement is rejected for review.
         *
         * possible_cross alone is intentionally not promoted to crossed.
         */
        return "invalid"
    }

    /*
    |--------------------------------------------------------------------------
    | Interpreted Question Result
    |--------------------------------------------------------------------------
    */

    private data class QuestionInterpretation(
        val answer: String?,
        val status: String,
        val qualityStatus: String,
        val needsReview: Boolean
    )

    /*
    |--------------------------------------------------------------------------
    | Hybrid Question Interpreter
    |--------------------------------------------------------------------------
    */

    private fun interpretHybridQuestion(
        shadedChoices: List<String>,
        crossedChoices: List<String>,
        invalidChoices: List<String>
    ): QuestionInterpretation {

        val invalidCount =
            invalidChoices.size

        val shadedCount =
            shadedChoices.size

        val crossedCount =
            crossedChoices.size

        /*
         * Rule 1:
         * Heavy corruption / unreadable row.
         */
        if (
            invalidCount >=
                3
        ) {

            return QuestionInterpretation(
                answer =
                    null,

                status =
                    "unreadable",

                qualityStatus =
                    "reject",

                needsReview =
                    true
            )
        }

        /*
         * Rule 2:
         * No selected or crossed marks.
         *
         * True blank is accepted.
         * Any invalid bubble turns it into ambiguous/review.
         */
        if (
            shadedCount ==
                0 &&
            crossedCount ==
                0
        ) {

            if (
                invalidCount ==
                    0
            ) {

                return QuestionInterpretation(
                    answer =
                        null,

                    status =
                        "blank",

                    qualityStatus =
                        "accepted",

                    needsReview =
                        false
                )
            }

            return QuestionInterpretation(
                answer =
                    null,

                status =
                    "ambiguous",

                qualityStatus =
                    "review",

                needsReview =
                    true
            )
        }

        /*
         * Rule 3:
         * Student crossed one or more bubbles but never supplied
         * a replacement shaded answer.
         */
        if (
            shadedCount ==
                0 &&
            crossedCount >
                0
        ) {

            return QuestionInterpretation(
                answer =
                    null,

                status =
                    "crossed_without_replacement",

                qualityStatus =
                    if (
                        invalidCount >
                            0
                    ) {
                        "review"
                    } else {
                        "accepted"
                    },

                needsReview =
                    invalidCount >
                        0
            )
        }

        /*
         * Rule 4:
         * Exactly one current selected answer.
         */
        if (
            shadedCount ==
                1
        ) {

            val status =
                if (
                    crossedCount >
                        0
                ) {
                    "selected_with_correction"
                } else {
                    "selected"
                }

            return QuestionInterpretation(
                answer =
                    shadedChoices[0],

                status =
                    status,

                qualityStatus =
                    if (
                        invalidCount >
                            0
                    ) {
                        "review"
                    } else {
                        "accepted"
                    },

                needsReview =
                    invalidCount >
                        0
            )
        }

        /*
         * Rule 5:
         * Two or more shaded bubbles means multiple current answers.
         */
        return QuestionInterpretation(
            answer =
                null,

            status =
                "multiple",

            qualityStatus =
                if (
                    invalidCount >
                        0
                ) {
                    "review"
                } else {
                    "accepted"
                },

            needsReview =
                invalidCount >
                    0
        )
    }

    /*
    |--------------------------------------------------------------------------
    | Marker Result
    |--------------------------------------------------------------------------
    */

    private data class MarkerDetectionData(
        val success: Boolean,

        val markerIds: List<Int>,

        val missingIds: List<Int>,

        val rejectedCount: Int,

        val markerCorners:
            Map<Int, Array<Point>>
    )

    /*
    |--------------------------------------------------------------------------
    | Coverage Measurement
    |--------------------------------------------------------------------------
    */

    private data class CoverageMeasurement(
        val coverage: Double,

        val backgroundMedian: Double,

        val darkThreshold: Double,

        val markedPixels: Int,

        val analysisPixels: Int,

        val backgroundPixels: Int
    )

    /*
    |--------------------------------------------------------------------------
    | Detect ArUco Markers
    |--------------------------------------------------------------------------
    */

    private fun detectSheetMarkers(
        image: Mat
    ): MarkerDetectionData {

        val dictionary =
            Objdetect.getPredefinedDictionary(
                Objdetect.DICT_4X4_50
            )

        val detector =
            ArucoDetector(
                dictionary
            )

        val corners =
            ArrayList<Mat>()

        val ids =
            Mat()

        val rejected =
            ArrayList<Mat>()

        try {

            detector.detectMarkers(
                image,
                corners,
                ids,
                rejected
            )

            val detectedIds =
                mutableListOf<Int>()

            val markerCorners =
                mutableMapOf<
                    Int,
                    Array<Point>
                >()

            if (!ids.empty()) {

                for (
                    row in
                    0 until ids.rows()
                ) {

                    val value =
                        ids.get(
                            row,
                            0
                        )

                    if (
                        value == null ||
                        value.isEmpty()
                    ) {
                        continue
                    }

                    val markerId =
                        value[0].toInt()

                    detectedIds.add(
                        markerId
                    )

                    if (
                        markerId in 0..3 &&
                        row < corners.size
                    ) {

                        val points =
                            extractMarkerPoints(
                                corners[row]
                            )

                        if (
                            points.size == 4
                        ) {

                            markerCorners[
                                markerId
                            ] = points
                        }
                    }
                }
            }

            val expectedIds =
                listOf(
                    0,
                    1,
                    2,
                    3
                )

            val missingIds =
                expectedIds.filter {
                    !markerCorners
                        .containsKey(
                            it
                        )
                }

            return MarkerDetectionData(
                success =
                    missingIds.isEmpty(),

                markerIds =
                    detectedIds,

                missingIds =
                    missingIds,

                rejectedCount =
                    rejected.size,

                markerCorners =
                    markerCorners
            )

        } finally {

            ids.release()

            corners.forEach {
                it.release()
            }

            rejected.forEach {
                it.release()
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Extract Marker Corners
    |--------------------------------------------------------------------------
    */

    private fun extractMarkerPoints(
        cornerMat: Mat
    ): Array<Point> {

        val points =
            mutableListOf<Point>()

        if (
            cornerMat.rows() == 1 &&
            cornerMat.cols() >= 4
        ) {

            for (
                col in
                0 until 4
            ) {

                val value =
                    cornerMat.get(
                        0,
                        col
                    )

                if (
                    value != null &&
                    value.size >= 2
                ) {

                    points.add(
                        Point(
                            value[0],
                            value[1]
                        )
                    )
                }
            }

        } else if (
            cornerMat.cols() == 1 &&
            cornerMat.rows() >= 4
        ) {

            for (
                row in
                0 until 4
            ) {

                val value =
                    cornerMat.get(
                        row,
                        0
                    )

                if (
                    value != null &&
                    value.size >= 2
                ) {

                    points.add(
                        Point(
                            value[0],
                            value[1]
                        )
                    )
                }
            }
        }

        return points.toTypedArray()
    }

    /*
    |--------------------------------------------------------------------------
    | Source Outer Marker Corners
    |--------------------------------------------------------------------------
    */

    private fun buildSourcePoints(
        markerCorners:
            Map<Int, Array<Point>>
    ): MatOfPoint2f {

        val marker0 =
            markerCorners[0]
                ?: throw Exception(
                    "Marker 0 corner data missing."
                )

        val marker1 =
            markerCorners[1]
                ?: throw Exception(
                    "Marker 1 corner data missing."
                )

        val marker2 =
            markerCorners[2]
                ?: throw Exception(
                    "Marker 2 corner data missing."
                )

        val marker3 =
            markerCorners[3]
                ?: throw Exception(
                    "Marker 3 corner data missing."
                )

        /*
         * Outer corners:
         *
         * ID 0 -> TL
         * ID 1 -> TR
         * ID 2 -> BR
         * ID 3 -> BL
         */

        return MatOfPoint2f(
            marker0[0],
            marker1[1],
            marker2[2],
            marker3[3]
        )
    }

    /*
    |--------------------------------------------------------------------------
    | Destination Marker Coordinates
    |--------------------------------------------------------------------------
    */

    private fun buildDestinationPoints():
        MatOfPoint2f {

        return MatOfPoint2f(
            Point(
                mmToX(
                    9.0
                ),
                mmToY(
                    51.0
                )
            ),

            Point(
                mmToX(
                    139.5
                ),
                mmToY(
                    51.0
                )
            ),

            Point(
                mmToX(
                    139.5
                ),
                mmToY(
                    201.0
                )
            ),

            Point(
                mmToX(
                    9.0
                ),
                mmToY(
                    201.0
                )
            )
        )
    }

    /*
    |--------------------------------------------------------------------------
    | 50-Item Bubble Center
    |--------------------------------------------------------------------------
    */

    private fun getBubbleCenter50(
        question: Int,
        choiceIndex: Int
    ): Point {

        if (
            question !in
            1..QUESTION_COUNT_50
        ) {

            throw IllegalArgumentException(
                "Question must be between 1 and 50."
            )
        }

        if (
            choiceIndex !in
            0..4
        ) {

            throw IllegalArgumentException(
                "Choice index must be between 0 and 4."
            )
        }

        val columnIndex =
            (question - 1) /
                ROWS_PER_COLUMN_50

        val rowIndex =
            (question - 1) %
                ROWS_PER_COLUMN_50

        val columnStartX =
            if (
                columnIndex == 0
            ) {

                LEFT_COLUMN_X_MM_50

            } else {

                RIGHT_COLUMN_X_MM_50
            }

        val xMm =
            columnStartX +
                (
                    choiceIndex *
                        CHOICE_PITCH_MM_50
                    )

        val yMm =
            FIRST_ROW_Y_MM_50 +
                (
                    rowIndex *
                        ROW_PITCH_MM_50
                    )

        return Point(
            mmToX(
                xMm
            ),
            mmToY(
                yMm
            )
        )
    }


    /*
    |--------------------------------------------------------------------------
    | 100-Item Bubble Center
    |--------------------------------------------------------------------------
    |
    | Questions:
    |   column 0 -> 1..25
    |   column 1 -> 26..50
    |   column 2 -> 51..75
    |   column 3 -> 76..100
    |--------------------------------------------------------------------------
    */

    private fun getBubbleCenter100(
        question: Int,
        choiceIndex: Int
    ): Point {

        if (
            question !in
            1..QUESTION_COUNT_100
        ) {
            throw IllegalArgumentException(
                "Question must be between 1 and 100."
            )
        }

        if (
            choiceIndex !in
            0..4
        ) {
            throw IllegalArgumentException(
                "Choice index must be between 0 and 4."
            )
        }

        val columnIndex =
            (question - 1) /
                ROWS_PER_COLUMN_100

        val rowIndex =
            (question - 1) %
                ROWS_PER_COLUMN_100

        val columnStartX =
            COLUMN_START_X_MM_100[
                columnIndex
            ]

        val xMm =
            columnStartX +
                (
                    choiceIndex *
                        CHOICE_PITCH_MM_100
                    )

        val yMm =
            FIRST_ROW_Y_MM_100 +
                (
                    rowIndex *
                        ROW_PITCH_MM_100
                    )

        return Point(
            mmToX(
                xMm
            ),
            mmToY(
                yMm
            )
        )
    }

    /*
    |--------------------------------------------------------------------------
    | Local Background Coverage
    |--------------------------------------------------------------------------
    |
    | 1. Gather grayscale pixels from local annulus:
    |
    |       2.05 mm <= radius <= 2.45 mm
    |
    | 2. Median of annulus = local paper/background brightness.
    |
    | 3. A pixel inside the 1.50 mm analysis disk is considered "marked"
    |    when it is at least 0.12 darker than the local background.
    |
    |       gray <= backgroundMedian - (0.12 * 255)
    |
    | 4. Coverage:
    |
    |       markedPixels / analysisPixels
    |
    |--------------------------------------------------------------------------
    */

    private fun measureCoverage(
        gray: Mat,
        centerX: Double,
        centerY: Double
    ): CoverageMeasurement {

        val pxPerMmX =
            NORMALIZED_WIDTH.toDouble() /
                SHEET_WIDTH_MM

        val pxPerMmY =
            NORMALIZED_HEIGHT.toDouble() /
                SHEET_HEIGHT_MM

        val halfContextMm =
            COVERAGE_CONTEXT_MM /
                2.0

        val minX =
            max(
                0,
                floor(
                    centerX -
                        halfContextMm *
                        pxPerMmX
                ).toInt()
            )

        val maxX =
            min(
                gray.cols() - 1,
                ceil(
                    centerX +
                        halfContextMm *
                        pxPerMmX
                ).toInt()
            )

        val minY =
            max(
                0,
                floor(
                    centerY -
                        halfContextMm *
                        pxPerMmY
                ).toInt()
            )

        val maxY =
            min(
                gray.rows() - 1,
                ceil(
                    centerY +
                        halfContextMm *
                        pxPerMmY
                ).toInt()
            )

        val backgroundValues =
            mutableListOf<Double>()

        /*
        |--------------------------------------------------------------------------
        | Local Background Annulus
        |--------------------------------------------------------------------------
        */

        for (
            y in
            minY..maxY
        ) {

            for (
                x in
                minX..maxX
            ) {

                val dxMm =
                    (
                        x.toDouble() -
                            centerX
                        ) /
                        pxPerMmX

                val dyMm =
                    (
                        y.toDouble() -
                            centerY
                        ) /
                        pxPerMmY

                val radiusMm =
                    sqrt(
                        dxMm * dxMm +
                            dyMm * dyMm
                    )

                if (
                    radiusMm >=
                    BACKGROUND_INNER_RADIUS_MM &&
                    radiusMm <=
                    BACKGROUND_OUTER_RADIUS_MM
                ) {

                    val pixel =
                        gray.get(
                            y,
                            x
                        )

                    if (
                        pixel != null &&
                        pixel.isNotEmpty()
                    ) {

                        backgroundValues.add(
                            pixel[0]
                        )
                    }
                }
            }
        }

        if (
            backgroundValues.isEmpty()
        ) {

            throw Exception(
                "Could not calculate local background."
            )
        }

        val backgroundMedian =
            median(
                backgroundValues
            )

        val darkThreshold =
            backgroundMedian -
                (
                    PIXEL_DARKNESS_EXCESS *
                        255.0
                    )

        var analysisPixels =
            0

        var markedPixels =
            0

        /*
        |--------------------------------------------------------------------------
        | Bubble Analysis Disk
        |--------------------------------------------------------------------------
        */

        for (
            y in
            minY..maxY
        ) {

            for (
                x in
                minX..maxX
            ) {

                val dxMm =
                    (
                        x.toDouble() -
                            centerX
                        ) /
                        pxPerMmX

                val dyMm =
                    (
                        y.toDouble() -
                            centerY
                        ) /
                        pxPerMmY

                val radiusMm =
                    sqrt(
                        dxMm * dxMm +
                            dyMm * dyMm
                    )

                if (
                    radiusMm <=
                    ANALYSIS_RADIUS_MM
                ) {

                    val pixel =
                        gray.get(
                            y,
                            x
                        )

                    if (
                        pixel == null ||
                        pixel.isEmpty()
                    ) {
                        continue
                    }

                    analysisPixels++

                    if (
                        pixel[0] <=
                        darkThreshold
                    ) {

                        markedPixels++
                    }
                }
            }
        }

        val coverage =
            if (
                analysisPixels > 0
            ) {

                markedPixels.toDouble() /
                    analysisPixels.toDouble()

            } else {

                0.0
            }

        return CoverageMeasurement(
            coverage =
                coverage,

            backgroundMedian =
                backgroundMedian,

            darkThreshold =
                darkThreshold,

            markedPixels =
                markedPixels,

            analysisPixels =
                analysisPixels,

            backgroundPixels =
                backgroundValues.size
        )
    }

    /*
    |--------------------------------------------------------------------------
    | Provisional Coverage Role
    |--------------------------------------------------------------------------
    */

    private fun classifyCoverage(
        coverage: Double
    ): String {

        return when {

            coverage >=
                SHADED_MIN -> {

                "shaded"
            }

            coverage <=
                UNSHADED_MAX -> {

                "unshaded"
            }

            else -> {

                "invalid"
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Median
    |--------------------------------------------------------------------------
    */

    private fun median(
        values: List<Double>
    ): Double {

        if (values.isEmpty()) {

            throw IllegalArgumentException(
                "Cannot calculate median of empty values."
            )
        }

        val sorted =
            values.sorted()

        val middle =
            sorted.size /
                2

        return if (
            sorted.size % 2 == 0
        ) {

            (
                sorted[
                    middle - 1
                ] +
                    sorted[
                        middle
                    ]
                ) /
                2.0

        } else {

            sorted[
                middle
            ]
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Physical MM → Normalized Pixels
    |--------------------------------------------------------------------------
    */

    private fun mmToX(
        mm: Double
    ): Double {

        return (
            mm /
                SHEET_WIDTH_MM *
                NORMALIZED_WIDTH.toDouble()
            )
    }

    private fun mmToY(
        mm: Double
    ): Double {

        return (
            mm /
                SHEET_HEIGHT_MM *
                NORMALIZED_HEIGHT.toDouble()
            )
    }

    /*
    |--------------------------------------------------------------------------
    | OpenCV Initialization
    |--------------------------------------------------------------------------
    */

    private fun ensureOpenCvInitialized() {

        if (
            openCvInitialized
        ) {
            return
        }

        synchronized(
            GradeLensOmrModule::class.java
        ) {

            if (
                openCvInitialized
            ) {
                return
            }

            Log.d(
                TAG,
                "Initializing OpenCV..."
            )

            val initialized =
                OpenCVLoader.initLocal()

            if (!initialized) {

                throw IllegalStateException(
                    "OpenCV native library initialization failed."
                )
            }

            openCvInitialized =
                true

            Log.d(
                TAG,
                "OpenCV initialized: ${Core.VERSION}"
            )
        }
    }

    /*
    |--------------------------------------------------------------------------
    | URI → Local Path
    |--------------------------------------------------------------------------
    */

    private fun uriToPath(
        imageUri: String
    ): String {

        if (
            imageUri.startsWith(
                "file://"
            )
        ) {

            return Uri.parse(
                imageUri
            ).path
                ?: throw Exception(
                    "Could not resolve image path."
                )
        }

        return imageUri
    }

}