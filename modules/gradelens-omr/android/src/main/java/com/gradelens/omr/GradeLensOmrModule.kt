package com.gradelens.omr

import android.net.Uri

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

import org.opencv.android.OpenCVLoader
import org.opencv.core.Core
import org.opencv.core.Mat
import org.opencv.core.MatOfPoint2f
import org.opencv.core.Point
import org.opencv.core.Rect
import org.opencv.core.Scalar
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
        | Capture Quality Gate
        |--------------------------------------------------------------------------
        |
        | Perspective normalization can correct rotation and moderate skew, but it
        | cannot recreate detail lost when the paper is captured too far away.
        | These gates are intentionally conservative: reject only captures whose
        | detected ArUco geometry indicates insufficient source detail or severe
        | perspective distortion before any academic interpretation begins.
        |
        */

        private const val CAPTURE_MIN_SHEET_AREA_RATIO =
            0.22

        private const val CAPTURE_MIN_MARKER_SIDE_PX =
            18.0

        private const val CAPTURE_MIN_OPPOSITE_EDGE_RATIO =
            0.45

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

        /*
         * Secondary illumination-normalized coverage pass.
         *
         * Raw calibrated coverage remains the primary signal. CLAHE-normalized
         * coverage is only used as corroborating evidence when raw coverage or
         * the CNN is uncertain, so lighting compensation does not silently
         * redefine the original calibration.
         */
        private const val ILLUMINATION_CLAHE_CLIP_LIMIT =
            2.0

        private const val ILLUMINATION_CLAHE_TILE_GRID =
            8.0

        /*
         * 50-item conservative recovery thresholds.
         *
         * These mirror the already-proven narrow 100-item recovery band instead
         * of globally widening UNSHADED_MAX. The resolver only recovers a bubble
         * when coverage, CNN, illumination-normalized coverage, and cross
         * geometry provide compatible evidence.
         */
        private const val BASELINE_UNSHADED_RECOVERY_MAX_50 =
            0.37

        /*
         * Clean-sheet testing showed false blank invalids clustering just above
         * UNSHADED_MAX (roughly 0.350 - 0.364) while the CNN strongly favored
         * Unshaded_Bubble and cross geometry said not_crossed. This confidence
         * floor is intentionally permissive only inside that narrow raw-coverage
         * band; it does not apply to mid-coverage / partially shaded marks.
         */
        private const val BASELINE_UNSHADED_RECOVERY_MIN_CONFIDENCE_50 =
            0.50

        private const val UNSHADED_RECOVERY_MAX_50 =
            0.40

        private const val CNN_UNSHADED_RECOVERY_MIN_CONFIDENCE_50 =
            0.60

        /*
         * 50-item per-sheet blank calibration.
         *
         * The raw coverage median across all 250 answer bubbles is a robust
         * proxy for the current photo's blank-bubble baseline because a normal
         * five-choice answer sheet contains far more unshaded than shaded
         * bubbles. The adaptive recovery boundary is allowed to move upward
         * only inside this bounded window; it never changes SHADED_MIN.
         */
        private const val SHEET_BLANK_RECOVERY_MARGIN_50 =
            0.05

        private const val SHEET_ADAPTIVE_UNSHADED_HARD_MAX_50 =
            0.42

        /*
         * Real no-flash clean-sheet captures still produced trustworthy blank
         * bubbles in the 0.82 - 0.88 CNN-confidence range. Because adaptive
         * recovery is additionally constrained by per-choice coverage and a
         * low interior-core darkness requirement, 0.80 is a safer evidence
         * floor than the previous 0.90 hard gate.
         */
        private const val SHEET_ADAPTIVE_UNSHADED_MIN_CONFIDENCE_50 =
            0.80

        /*
         * High-confidence blank recovery (Checkpoint 6).
         *
         * Clean no-flash control scans still produced bubbles around 0.373 -
         * 0.380 coverage while the CNN reported Unshaded_Bubble at roughly
         * 0.98 - 0.999 confidence and cross geometry reported not_crossed.
         * Those are overwhelmingly blank signals, even when the current sheet
         * median keeps the adaptive lane limit clamped near 0.37.
         *
         * This rule is intentionally asymmetric and bounded: it can only
         * recover CNN-Unshaded bubbles in the narrow 0.35 - 0.40 raw coverage
         * region. It cannot promote a CNN-Shaded/Invalid mark to blank, and it
         * never overrides a possible/definite cross.
         */
        private const val HIGH_CONFIDENCE_UNSHADED_RECOVERY_MAX_50 =
            0.40

        private const val HIGH_CONFIDENCE_UNSHADED_RECOVERY_MIN_CONFIDENCE_50 =
            0.95

        private const val SHEET_LANE_BLANK_CANDIDATE_MARGIN_50 =
            0.14

        private const val SHEET_LANE_MIN_SAMPLE_COUNT_50 =
            8

        private const val SHEET_ADAPTIVE_UNSHADED_MAX_CORE_COVERAGE_50 =
            0.25

        /*
         * A weak possible-cross can be ignored only when the whole sheet shows
         * a darker blank baseline and the bubble otherwise has overwhelming
         * blank evidence. 0.06 is the midpoint of the existing possible (0.04)
         * and definite (0.08) cross thresholds; stronger possible-cross signals
         * remain review-worthy.
         */
        private const val WEAK_POSSIBLE_CROSS_MAX_SCORE_50 =
            0.06

        private const val WEAK_POSSIBLE_CROSS_MIN_UNSHADED_CONFIDENCE_50 =
            0.95

        /*
         * When raw calibrated coverage is already clearly unshaded but the CNN
         * weakly chooses Invalid_Bubble, do not let CLAHE-created outline
         * contrast manufacture a review case. Strong Invalid predictions remain
         * unresolved.
         */
        private const val CNN_INVALID_BLANK_RECOVERY_MAX_CONFIDENCE_50 =
            0.65

        /*
         * Interior-fill diagnostics. Coverage across the whole 1.50 mm disk
         * can be inflated by the printed bubble outline. These measurements
         * focus on the interior so a uniformly filled bubble can be separated
         * from a half/partial shade and from an otherwise blank printed ring.
         */
        private const val FILL_INTERIOR_RADIUS_MM =
            1.10

        private const val FILL_CORE_RADIUS_MM =
            0.65

        /*
         * Pipeline V2 / Normalization Baseline.
         *
         * These thresholds are DIAGNOSTIC ONLY in this checkpoint. They do not
         * participate in bubble classification. They measure how much
         * student-added darkness persists after progressively stronger local
         * background-relative darkness requirements.
         *
         * The interior radius intentionally excludes most of the printed bubble
         * outline. The outer ring (1.10-1.50 mm) is measured separately as
         * template/outline nuisance evidence.
         */
        private const val MARK_PROFILE_WEAK_DARKNESS_EXCESS =
            0.08

        private const val MARK_PROFILE_NORMAL_DARKNESS_EXCESS =
            PIXEL_DARKNESS_EXCESS

        private const val MARK_PROFILE_STRONG_DARKNESS_EXCESS =
            0.18

        private const val MARK_PROFILE_VERY_STRONG_DARKNESS_EXCESS =
            0.24

        /*
         * Fine-grained fill morphology (Checkpoint 5).
         *
         * The 4-quadrant test from Checkpoint 4 is useful, but a physical
         * half-shade can occasionally look balanced after camera resampling.
         * A 3x3 interior grid and three radial bands expose local holes,
         * directional under-fill, and edge-only darkness more reliably.
         */
        private const val FILL_GRID_RADIUS_MM =
            1.10

        private const val FILL_RADIAL_INNER_RADIUS_MM =
            0.40

        private const val FILL_RADIAL_MIDDLE_RADIUS_MM =
            0.75

        /*
         * Review-precision morphology guard (50-item path).
         *
         * These values do NOT define a valid shade. The existing GradeLens
         * business thresholds below still decide valid vs insufficient shade.
         * Morphology is used only to rescue a would-be generic REVIEW when the
         * physical evidence already looks like a non-cross shade attempt and
         * multiple independent fill-shape measurements agree that the mark is
         * incomplete / one-sided / center-heavy.
         *
         * Two independent morphology votes are required so one noisy metric
         * cannot turn an uncertain bubble into an automatic INVALID.
         */
        private const val MORPHOLOGY_SHADE_MIN_CNN_CONFIDENCE_50 =
            0.75

        private const val MORPHOLOGY_INVALID_MIN_CNN_CONFIDENCE_50 =
            0.80

        private const val MORPHOLOGY_ABOVE_BLANK_MARGIN_50 =
            0.04

        private const val MORPHOLOGY_CORE_MARK_MIN_50 =
            0.35

        private const val MORPHOLOGY_EDGE_REACH_LOW_50 =
            0.65

        private const val MORPHOLOGY_SECTOR_SPREAD_HIGH_50 =
            0.35

        private const val MORPHOLOGY_GRID_SPREAD_HIGH_50 =
            0.40

        private const val MORPHOLOGY_RADIAL_SPREAD_HIGH_50 =
            0.35

        private const val MORPHOLOGY_CENTROID_OFFSET_HIGH_50 =
            0.30

        private const val MORPHOLOGY_MIN_GRID_HOLE_MAX_50 =
            0.15

        private const val MORPHOLOGY_REQUIRED_INVALID_VOTES_50 =
            2

        /*
         * Checkpoint 4.7A: configured shade-completeness policy.
         *
         * IMPORTANT: SHADE_COMPLETENESS_MIN is a normalized GradeLens
         * completeness score, not a literal percentage of black pixels.
         * The score intentionally combines whole-bubble dark support with how
         * well the mark reaches the outer part of the usable bubble area.
         * This prevents a very dark center-only / half shade from being treated
         * as complete merely because its inner pixels are black.
         *
         * Business intent:
         * - clearly complete / near-complete shade -> valid shaded answer
         * - clearly partial shade -> INVALID: insufficient_shade
         * - genuine classifier/geometric uncertainty -> REVIEW
         */
        private const val SHADE_COMPLETENESS_MIN =
            0.80

        private const val SHADE_VALID_MIN_RAW_SUPPORT =
            0.72

        /*
         * A valid shade must also reach enough of the outer usable bubble band.
         * This guard is what keeps a dense center/half-shade from becoming
         * VALID_SHADED merely because its center is very dark.
         *
         * Control-sheet intent:
         * - Q5  (~25%) -> invalid (raw support too low)
         * - Q13 (~50%) -> invalid (outer reach too low)
         * - Q40 (~80%) -> valid
         */
        private const val SHADE_VALID_MIN_EDGE_REACH =
            0.78

        private const val SHADE_POLICY_MIN_CNN_CONFIDENCE =
            0.90

        private const val SHADE_COMPLETENESS_DENSITY_WEIGHT =
            0.35

        private const val SHADE_COMPLETENESS_EDGE_REACH_WEIGHT =
            0.65

        /*
         * Checkpoint 4 escalation-ladder SHADOW gate.
         *
         * IMPORTANT: these values do NOT decide whether a student's shade is
         * valid. They are deliberately conservative performance-routing values
         * used only to estimate which obviously blank bubbles could bypass CNN
         * in the next checkpoint. Final complete-shade thresholds will be
         * calibrated separately from real GradeLens control sheets.
         */
        private const val LADDER_SHADOW_CLEAR_BLANK_MAX_COVERAGE =
            0.30

        private const val LADDER_SHADOW_CLEAR_BLANK_MAX_INTERIOR_NORMAL =
            0.35

        private const val LADDER_SHADOW_CLEAR_BLANK_MAX_INTERIOR_STRONG =
            0.22

        private const val LADDER_SHADOW_CLEAR_BLANK_MAX_CORE_COVERAGE =
            0.35

        private const val SHADED_RECOVERY_MIN_COVERAGE =
            0.70

        private const val CNN_SHADED_RECOVERY_MIN_CONFIDENCE =
            0.75

        /*
         * 100-item-only recovery thresholds.
         *
         * These values remain specific to the smaller/tighter 100-item bubble
         * geometry seen in real normalized phone captures. The 50-item path now
         * has its own separately bounded recovery band above.
         */
        private const val BASELINE_UNSHADED_RECOVERY_MAX_100 =
            0.37

        private const val UNSHADED_RECOVERY_MAX_100 =
            0.40

        private const val CNN_UNSHADED_RECOVERY_MIN_CONFIDENCE_100 =
            0.60

        @Volatile
        private var openCvInitialized =
            false
    }

    /*
     * The scanner already runs diagnoseYoloRois() immediately before the
     * question analyzer. Cache only the accepted Q#/choice proposals so the
     * escalation ladder can reuse that YOLO work instead of running ONNX a
     * second time. The cache is intentionally tiny and scoped to one normalized
     * image URI + question count.
     */
    private data class YoloProposalCache(
        val normalizedImageUri: String,
        val questionCount: Int,
        val acceptedSlots: Set<String>,
        val acceptedConfidences: Map<String, Double>,
    )

    private var lastYoloProposalCache:
        YoloProposalCache? =
        null

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
                            "ARUCO_MARKERS_MISSING:${markerResult.missingIds}"
                        )
                    }

                    val captureQuality =
                        evaluateCaptureQuality(
                            image = image,
                            markerCorners = markerResult.markerCorners
                        )

                    if (!captureQuality.accepted) {
                        throw Exception(
                            when (captureQuality.reason) {
                                "too_far" ->
                                    "CAPTURE_TOO_FAR:" +
                                        "areaRatio=${captureQuality.sheetAreaRatio}," +
                                        "minMarkerSide=${captureQuality.minMarkerSidePx}"

                                "too_skewed" ->
                                    "CAPTURE_TOO_SKEWED:" +
                                        "widthRatio=${captureQuality.widthOppositeEdgeRatio}," +
                                        "heightRatio=${captureQuality.heightOppositeEdgeRatio}"

                                else ->
                                    "CAPTURE_QUALITY_FAILED:${captureQuality.reason}"
                            }
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

                            "captureQuality" to
                                mapOf(
                                    "accepted" to captureQuality.accepted,
                                    "reason" to captureQuality.reason,
                                    "sheetAreaRatio" to captureQuality.sheetAreaRatio,
                                    "minMarkerSidePx" to captureQuality.minMarkerSidePx,
                                    "widthOppositeEdgeRatio" to captureQuality.widthOppositeEdgeRatio,
                                    "heightOppositeEdgeRatio" to captureQuality.heightOppositeEdgeRatio
                                ),

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

                                        "reliable" to
                                            it.reliable,

                                        "consensusCount" to
                                            it.consensusCount,

                                        "variantCount" to
                                            it.variantCount,

                                        "recognitionMethod" to
                                            it.recognitionMethod,

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


            /*
            |--------------------------------------------------------------------------
            | YOLO ROI Diagnostic — Mobile Integration Checkpoint 1
            |--------------------------------------------------------------------------
            |
            | IMPORTANT:
            | - This does NOT replace the current template cropper yet.
            | - This does NOT change CNN/coverage/cross decisions.
            | - It runs the original best.onnx detector beside the current reader.
            | - Detections are mapped to the known GradeLens 5-choice layout only
            |   for alignment diagnostics.
            |
            | This lets us verify:
            |   1. whether "marked" means every bubble ROI or only marked answers;
            |   2. detector count/latency on the actual Android phone;
            |   3. how closely YOLO box centers agree with Q#/A-E positions;
            |   4. whether any slots are missing or duplicated.
            |--------------------------------------------------------------------------
            */

            /*
            |--------------------------------------------------------------------------
            | Production YOLO proposal pass
            |--------------------------------------------------------------------------
            |
            | Checkpoint 4.5 freezes the marked-object confidence threshold at 0.10.
            | This production path runs YOLO once, maps accepted detections to the
            | fixed GradeLens bubble grid, and caches only Q#/choice proposals.
            | It intentionally creates no debug overlay, no confidence sweep, and no
            | gallery image. Cross detection remains independently protected by the
            | cheap CrossAnalyzer precheck inside the question analyzer.
            |--------------------------------------------------------------------------
            */

            AsyncFunction(
                "prepareYoloProposals"
            ) {
                normalizedImageUri: String,
                questionCount: Int ->

                ensureOpenCvInitialized()

                if (
                    questionCount != QUESTION_COUNT_50 &&
                    questionCount != QUESTION_COUNT_100
                ) {
                    throw IllegalArgumentException(
                        "YOLO proposals support only 50 or 100 questions."
                    )
                }

                val imagePath =
                    uriToPath(normalizedImageUri)

                val image =
                    Imgcodecs.imread(
                        imagePath,
                        Imgcodecs.IMREAD_COLOR
                    )

                if (image.empty()) {
                    image.release()
                    throw Exception(
                        "OpenCV could not load the normalized image for YOLO proposals."
                    )
                }

                try {
                    if (
                        image.cols() != NORMALIZED_WIDTH ||
                        image.rows() != NORMALIZED_HEIGHT
                    ) {
                        throw Exception(
                            "YOLO proposals require a normalized " +
                                "${NORMALIZED_WIDTH}x${NORMALIZED_HEIGHT} image."
                        )
                    }

                    val androidContext =
                        appContext.reactContext
                            ?: throw Exception(
                                "Android React context is unavailable."
                            )

                    YoloBubbleDetector(androidContext).use { detector ->
                        val detectionResult =
                            detector.detect(
                                image,
                                YoloBubbleDetector.CONFIDENCE_THRESHOLD,
                            )

                        val mapping =
                            mapYoloDetectionsToExpectedSlots(
                                detections = detectionResult.detections,
                                questionCount = questionCount,
                            )

                        val acceptedProposalItems =
                            mapping.gatedDetections.filter { item ->
                                item.accepted &&
                                    item.question != null &&
                                    item.choice != null
                            }

                        val acceptedProposalSlots =
                            acceptedProposalItems
                                .map { item ->
                                    bubbleSlotKey(
                                        item.question!!,
                                        item.choice!!
                                    )
                                }
                                .toSet()

                        val acceptedProposalConfidences =
                            acceptedProposalItems
                                .associate { item ->
                                    bubbleSlotKey(
                                        item.question!!,
                                        item.choice!!
                                    ) to item.detection.confidence.toDouble()
                                }

                        lastYoloProposalCache =
                            YoloProposalCache(
                                normalizedImageUri = normalizedImageUri,
                                questionCount = questionCount,
                                acceptedSlots = acceptedProposalSlots,
                                acceptedConfidences = acceptedProposalConfidences,
                            )

                        mapOf(
                            "success" to true,
                            "questionCount" to questionCount,
                            "proposalCount" to acceptedProposalSlots.size,
                            "confidenceThreshold" to
                                YoloBubbleDetector.CONFIDENCE_THRESHOLD.toDouble(),
                        )
                    }
                } finally {
                    image.release()
                }
            }


            AsyncFunction(
                "diagnoseYoloRois"
            ) {
                normalizedImageUri: String,
                questionCount: Int ->

                ensureOpenCvInitialized()

                if (
                    questionCount !=
                        QUESTION_COUNT_50 &&
                    questionCount !=
                        QUESTION_COUNT_100
                ) {
                    throw IllegalArgumentException(
                        "YOLO ROI diagnostics support only 50 or 100 questions."
                    )
                }

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
                        "OpenCV could not load the normalized image for YOLO diagnostics."
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
                            "YOLO diagnostics require a normalized " +
                                "${NORMALIZED_WIDTH}x${NORMALIZED_HEIGHT} image."
                        )
                    }

                    val androidContext =
                        appContext.reactContext
                            ?: throw Exception(
                                "Android React context is unavailable."
                            )

                    val detectorInitStartNs =
                        android.os.SystemClock.elapsedRealtimeNanos()

                    YoloBubbleDetector(
                        androidContext
                    ).use {
                        detector ->

                        val detectorInitMs =
                            (
                                android.os.SystemClock.elapsedRealtimeNanos() -
                                    detectorInitStartNs
                                ) /
                                1_000_000.0

                        /*
                         * Checkpoint 4.4: run ONNX exactly once at the low
                         * diagnostic floor. The ACTIVE production proposal set
                         * now uses 0.10, while the confidence-sweep points are
                         * derived from the same inference result.
                         */
                        val detectionResult =
                            detector.detect(
                                image,
                                YoloBubbleDetector.DIAGNOSTIC_SWEEP_MIN_CONFIDENCE,
                            )

                        val defaultDetections =
                            detectionResult.detections.filter { detection ->
                                detection.confidence >=
                                    YoloBubbleDetector.CONFIDENCE_THRESHOLD
                            }

                        val sweepThresholds =
                            listOf(
                                0.05f,
                                0.10f,
                                0.15f,
                                0.20f,
                                0.25f,
                                0.30f,
                            )

                        val mappingStartNs =
                            android.os.SystemClock.elapsedRealtimeNanos()

                        val mapping =
                            mapYoloDetectionsToExpectedSlots(
                                detections =
                                    defaultDetections,
                                questionCount =
                                    questionCount
                            )

                        val mappingMs =
                            (
                                android.os.SystemClock.elapsedRealtimeNanos() -
                                    mappingStartNs
                                ) /
                                1_000_000.0

                        val sweepMappingStartNs =
                            android.os.SystemClock.elapsedRealtimeNanos()

                        val confidenceSweepPoints =
                            sweepThresholds.map { threshold ->
                                val thresholdDetections =
                                    detectionResult.detections.filter { detection ->
                                        detection.confidence >= threshold
                                    }

                                val thresholdMapping =
                                    mapYoloDetectionsToExpectedSlots(
                                        detections =
                                            thresholdDetections,
                                        questionCount =
                                            questionCount,
                                    )

                                mapOf(
                                    "threshold" to
                                        threshold.toDouble(),
                                    "confidenceFilteredCount" to
                                        detectionResult.preNmsDetections.count { detection ->
                                            detection.confidence >= threshold
                                        },
                                    "detectedAfterNms" to
                                        thresholdDetections.size,
                                    "mappedProposalCount" to
                                        thresholdMapping.matchedExpectedCount,
                                    "unmatchedDetectionCount" to
                                        thresholdMapping.unmatchedDetectionCount,
                                    "duplicateRejectedCount" to
                                        thresholdMapping.duplicateRejectedCount,
                                    "matchedRatio" to
                                        thresholdMapping.matchedRatio,
                                    "matches" to
                                        thresholdMapping.matches.map { row ->
                                            mapOf(
                                                "question" to row["question"]!!,
                                                "choice" to row["choice"]!!,
                                                "confidence" to row["confidence"]!!,
                                            )
                                        },
                                )
                            }

                        val sweepMappingMs =
                            (
                                android.os.SystemClock.elapsedRealtimeNanos() -
                                    sweepMappingStartNs
                                ) /
                                1_000_000.0

                        val acceptedProposalItems =
                            mapping.gatedDetections
                                .filter { item ->
                                    item.accepted &&
                                        item.question != null &&
                                        item.choice != null
                                }

                        val acceptedProposalSlots =
                            acceptedProposalItems
                                .map { item ->
                                    bubbleSlotKey(
                                        item.question!!,
                                        item.choice!!
                                    )
                                }
                                .toSet()

                        val acceptedProposalConfidences =
                            acceptedProposalItems
                                .associate { item ->
                                    bubbleSlotKey(
                                        item.question!!,
                                        item.choice!!
                                    ) to
                                        item.detection.confidence.toDouble()
                                }

                        lastYoloProposalCache =
                            YoloProposalCache(
                                normalizedImageUri =
                                    normalizedImageUri,
                                questionCount =
                                    questionCount,
                                acceptedSlots =
                                    acceptedProposalSlots,
                                acceptedConfidences =
                                    acceptedProposalConfidences,
                            )

                        /*
                         * Production cleanup: debug overlay/crop generation is
                         * disabled. No YOLO diagnostic image is written to the
                         * app cache or Gallery.
                         */
                        val debugQuestion =
                            min(
                                13,
                                questionCount
                            )

                        val debugVisualization =
                            YoloDebugVisualization(
                                fullOverlayUri = "",
                                question = debugQuestion,
                                questionCropUri = "",
                            )

                        val likelyDetectorBehavior =
                            when {
                                mapping.expectedBubbleCount <=
                                    0 ->
                                    "unknown"

                                mapping.matchedExpectedCount >=
                                    (
                                        mapping.expectedBubbleCount *
                                            0.90
                                        ) ->
                                    "all_or_most_bubble_rois"

                                mapping.matchedExpectedCount <=
                                    (
                                        questionCount *
                                            2
                                        ) ->
                                    "likely_marked_answers_only_or_low_recall"

                                else ->
                                    "partial_bubble_roi_coverage"
                            }

                        mapOf(
                            "success" to
                                true,

                            "diagnosticOnly" to
                                true,

                            "decisionBehavior" to
                                "checkpoint_4_4_yolo_mark_threshold_010_active",

                            "model" to
                                mapOf(
                                    "asset" to
                                        YoloBubbleDetector.MODEL_ASSET,
                                    "className" to
                                        YoloBubbleDetector.CLASS_NAME,
                                    "inputShape" to
                                        listOf(
                                            1,
                                            3,
                                            YoloBubbleDetector.INPUT_SIZE,
                                            YoloBubbleDetector.INPUT_SIZE,
                                        ),
                                    "expectedOutputShape" to
                                        listOf(
                                            1,
                                            5,
                                            8400,
                                        ),
                                    "confidenceThreshold" to
                                        YoloBubbleDetector.CONFIDENCE_THRESHOLD.toDouble(),
                                    "diagnosticSweepFloor" to
                                        YoloBubbleDetector.DIAGNOSTIC_SWEEP_MIN_CONFIDENCE.toDouble(),
                                    "nmsIouThreshold" to
                                        YoloBubbleDetector.NMS_IOU_THRESHOLD.toDouble(),
                                ),

                            "questionCount" to
                                questionCount,

                            "choicesPerQuestion" to
                                5,

                            "expectedBubbleCount" to
                                mapping.expectedBubbleCount,

                            "detectedAfterNms" to
                                defaultDetections.size,

                            "rawCandidateCount" to
                                detectionResult.rawCandidateCount,

                            "confidenceFilteredCount" to
                                detectionResult.preNmsDetections.count { detection ->
                                    detection.confidence >=
                                        YoloBubbleDetector.CONFIDENCE_THRESHOLD
                                },

                            "matchedExpectedCount" to
                                mapping.matchedExpectedCount,

                            "missingExpectedCount" to
                                mapping.missingExpectedCount,

                            "unmatchedDetectionCount" to
                                mapping.unmatchedDetectionCount,

                            "duplicateRejectedCount" to
                                mapping.duplicateRejectedCount,

                            "matchedRatio" to
                                mapping.matchedRatio,

                            "roiGate" to
                                mapOf(
                                    "mode" to
                                        "nearest_expected_bubble_slot",
                                    "acceptedDetectionCount" to
                                        mapping.gatedDetections.count {
                                            item ->
                                            item.accepted
                                        },
                                    "ignoredDetectionCount" to
                                        mapping.gatedDetections.count {
                                            item ->
                                            !item.accepted
                                        },
                                    "ignoredUnmatchedCount" to
                                        mapping.unmatchedDetectionCount,
                                    "ignoredDuplicateCount" to
                                        mapping.duplicateRejectedCount,
                                    "matchDistanceLimitMm" to
                                        mapping.matchDistanceLimitMm,
                                    "behavior" to
                                        "diagnostic_gate_only_no_answer_change",
                                ),

                            "debugVisualization" to
                                mapOf(
                                    "fullOverlayUri" to
                                        debugVisualization.fullOverlayUri,
                                    "question" to
                                        debugVisualization.question,
                                    "questionCropUri" to
                                        debugVisualization.questionCropUri,
                                ),

                            "likelyDetectorBehavior" to
                                likelyDetectorBehavior,

                            "matchDistanceLimitMm" to
                                mapping.matchDistanceLimitMm,

                            "centerErrorMm" to
                                mapOf(
                                    "mean" to
                                        mapping.meanCenterErrorMm,
                                    "median" to
                                        mapping.medianCenterErrorMm,
                                    "max" to
                                        mapping.maxCenterErrorMm,
                                ),

                            "letterbox" to
                                mapOf(
                                    "scale" to
                                        detectionResult.scale,
                                    "padX" to
                                        detectionResult.padX,
                                    "padY" to
                                        detectionResult.padY,
                                    "resizedWidth" to
                                        detectionResult.resizedWidth,
                                    "resizedHeight" to
                                        detectionResult.resizedHeight,
                                ),

                            "timingMs" to
                                mapOf(
                                    "detectorInit" to
                                        detectorInitMs,
                                    "total" to
                                        detectionResult.timing.totalMs,
                                    "preprocess" to
                                        detectionResult.timing.preprocessMs,
                                    "inference" to
                                        detectionResult.timing.inferenceMs,
                                    "decode" to
                                        detectionResult.timing.decodeMs,
                                    "nms" to
                                        detectionResult.timing.nmsMs,
                                    "mapping" to
                                        mappingMs,
                                    "sweepMapping" to
                                        sweepMappingMs,
                                ),

                            "confidenceSweep" to
                                mapOf(
                                    "mode" to
                                        "single_inference_multi_threshold",
                                    "inferenceRunCount" to
                                        1,
                                    "sweepFloor" to
                                        YoloBubbleDetector.DIAGNOSTIC_SWEEP_MIN_CONFIDENCE.toDouble(),
                                    "defaultThreshold" to
                                        YoloBubbleDetector.CONFIDENCE_THRESHOLD.toDouble(),
                                    "thresholds" to
                                        sweepThresholds.map { threshold ->
                                            threshold.toDouble()
                                        },
                                    "points" to
                                        confidenceSweepPoints,
                                ),

                            "matches" to
                                mapping.matches,

                            "sampleMatches" to
                                mapping.sampleMatches,

                            "worstMatches" to
                                mapping.worstMatches,

                            "missingSlots" to
                                mapping.missingSlots,
                        )
                    }

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
            | Checkpoint 4 semantic split:
            | - review bubbles require human assistance
            | - invalid bubbles are machine-understood rule violations and are
            |   directly scoreable as zero without human review.
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

                val illuminationNormalizedGray =
                    Mat()

                var illuminationClahe:
                    org.opencv.imgproc.CLAHE? =
                    null

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

                    val illuminationNormalizationStartNs =
                        android.os.SystemClock.elapsedRealtimeNanos()

                    illuminationClahe =
                        Imgproc.createCLAHE(
                            ILLUMINATION_CLAHE_CLIP_LIMIT,
                            Size(
                                ILLUMINATION_CLAHE_TILE_GRID,
                                ILLUMINATION_CLAHE_TILE_GRID
                            )
                        )

                    illuminationClahe.apply(
                        gray,
                        illuminationNormalizedGray
                    )

                    val illuminationNormalizationNs =
                        android.os.SystemClock.elapsedRealtimeNanos() -
                            illuminationNormalizationStartNs

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

                    val yoloProposalCache50 =
                        lastYoloProposalCache
                            ?.takeIf { cache ->
                                cache.normalizedImageUri ==
                                    normalizedImageUri &&
                                    cache.questionCount ==
                                        QUESTION_COUNT_50
                            }
                            ?: throw Exception(
                                "YOLO proposals were not prepared for this 50-item sheet."
                            )

                    val yoloProposalSlots50 =
                        yoloProposalCache50.acceptedSlots

                    val yoloProposalConfidences50 =
                        yoloProposalCache50.acceptedConfidences

                    var ladderClearBlankCandidateCount = 0
                    var ladderMarkCandidateCount = 0
                    var ladderFillRouteCount = 0
                    var ladderCrossRouteCount = 0
                    var ladderUncertainRouteCount = 0

                    var quickCrossPrecheckCount = 0
                    var quickCrossPlausibleCount = 0
                    var quickCrossPrecheckNs = 0L

                    val questions =
                        mutableListOf<Map<String, Any?>>()

                    val statusCounts =
                        mutableMapOf(
                            "blank" to 0,
                            "selected" to 0,
                            "selected_with_correction" to 0,
                            "crossed_without_replacement" to 0,
                            "multiple" to 0,
                            "invalid" to 0,
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

                    /*
                     * Accuracy-first 50-item calibration.
                     *
                     * Build the bounded per-sheet/per-choice blank baseline from the
                     * actual normalized capture before interpreting answers. This
                     * restores the lighting/printing adaptation used by the resolver
                     * while keeping the business shade threshold itself unchanged.
                     */
                    val rawMeasurements50 =
                        mutableListOf<CoverageMeasurement>()

                    val rawCoverageCache50 =
                        mutableMapOf<String, CoverageMeasurement>()

                    for (question in 1..QUESTION_COUNT_50) {
                        for (choiceIndex in 0 until 5) {
                            val choice =
                                ('A'.code + choiceIndex)
                                    .toChar()
                                    .toString()

                            val center =
                                getBubbleCenter50(
                                    question = question,
                                    choiceIndex = choiceIndex
                                )

                            val measurement =
                                measureCoverage(
                                    gray = gray,
                                    centerX = center.x,
                                    centerY = center.y
                                )

                            rawMeasurements50.add(measurement)
                            rawCoverageCache50[
                                bubbleSlotKey(question, choice)
                            ] = measurement
                        }
                    }

                    val sheetBlankCalibration50 =
                        buildSheetBlankCalibration50(
                            rawMeasurements50
                        )

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

                            val reviewChoices =
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

                                val preflightYoloSlotKey =
                                    bubbleSlotKey(
                                        question,
                                        choice
                                    )

                                val preflightHasYoloProposal =
                                    preflightYoloSlotKey in
                                        yoloProposalSlots50

                                /*
                                 * Accuracy-first candidate routing.
                                 *
                                 * YOLO absence is no longer enough to declare a bubble blank.
                                 * Partial/irregular shades (for example the Q5/Q13 control
                                 * marks) may be weak YOLO proposals but still contain enough
                                 * coverage evidence to classify confidently as INVALID.
                                 *
                                 * The quick cross pass remains useful for deciding whether the
                                 * expensive full CrossAnalyzer should run; every bubble still
                                 * reaches CNN + coverage so business shade completeness can be
                                 * enforced consistently.
                                 */
                                var preflightQuickCross:
                                    CrossAnalyzer.QuickPrecheckResult? =
                                    null

                                if (!preflightHasYoloProposal) {
                                    val preflightQuickCrossStartNs =
                                        android.os.SystemClock.elapsedRealtimeNanos()

                                    val preflightResult =
                                        crossAnalyzer.quickPrecheck(
                                            normalizedImage = image,
                                            centerX = center.x,
                                            centerY = center.y,
                                        )

                                    preflightQuickCross =
                                        preflightResult

                                    quickCrossPrecheckNs +=
                                        android.os.SystemClock.elapsedRealtimeNanos() -
                                            preflightQuickCrossStartNs

                                    quickCrossPrecheckCount++

                                    if (preflightResult.plausibleCross) {
                                        quickCrossPlausibleCount++
                                    }
                                }

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
                                        rawCoverageCache50[
                                            bubbleSlotKey(question, choice)
                                        ] ?: measureCoverage(
                                            gray =
                                                gray,

                                            centerX =
                                                center.x,

                                            centerY =
                                                center.y
                                        )

                                    val normalizedCoverageMeasurement =
                                        measureCoverage(
                                            gray =
                                                illuminationNormalizedGray,

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

                                    val normalizedCoverageRole =
                                        classifyCoverage(
                                            normalizedCoverageMeasurement.coverage
                                        )

                                    val yoloSlotKey =
                                        bubbleSlotKey(
                                            question,
                                            choice
                                        )

                                    val hasYoloProposal =
                                        yoloSlotKey in
                                            yoloProposalSlots50

                                    val yoloConfidence =
                                        yoloProposalConfidences50[
                                            yoloSlotKey
                                        ] ?: 0.0

                                    val ladderClearBlankCandidate =
                                        isShadowClearBlankCandidate(
                                            coverageMeasurement =
                                                coverageMeasurement,
                                            hasYoloProposal =
                                                hasYoloProposal
                                        )

                                    val quickCrossPrecheck =
                                        preflightQuickCross
                                            ?: if (
                                                ladderClearBlankCandidate
                                            ) {
                                                null
                                            } else {
                                                val quickCrossStartNs =
                                                    android.os.SystemClock.elapsedRealtimeNanos()

                                                val result =
                                                    crossAnalyzer.quickPrecheck(
                                                        normalizedImage = image,
                                                        centerX = center.x,
                                                        centerY = center.y,
                                                    )

                                                quickCrossPrecheckNs +=
                                                    android.os.SystemClock.elapsedRealtimeNanos() -
                                                        quickCrossStartNs

                                                quickCrossPrecheckCount++

                                                if (result.plausibleCross) {
                                                    quickCrossPlausibleCount++
                                                }

                                                result
                                            }

                                    val ladderRoute =
                                        when {
                                            ladderClearBlankCandidate ->
                                                "clear_blank_fast_exit"

                                            quickCrossPrecheck?.plausibleCross ==
                                                true ||
                                                prediction.label ==
                                                    "Crossed_Bubble" ->
                                                "cross_verification"

                                            prediction.label ==
                                                "Shaded_Bubble" ||
                                                hasYoloProposal ->
                                                "fill_validation"

                                            else ->
                                                "uncertain_candidate"
                                        }

                                    if (ladderClearBlankCandidate) {
                                        ladderClearBlankCandidateCount++
                                    } else {
                                        ladderMarkCandidateCount++
                                    }

                                    when (ladderRoute) {
                                        "fill_validation" -> ladderFillRouteCount++
                                        "cross_verification" -> ladderCrossRouteCount++
                                        "uncertain_candidate" -> ladderUncertainRouteCount++
                                    }

                                    /*
                                     * Checkpoint 4.6 selective cross execution.
                                     *
                                     * YOLO and the cheap cross precheck decide whether the
                                     * expensive geometric CrossAnalyzer is actually needed.
                                     * Ordinary shade-like candidates still use CNN + coverage,
                                     * but they are resolved with crossState=not_crossed when
                                     * neither the CNN nor quick precheck sees cross evidence.
                                     */
                                    val directUnshadedAgreement =
                                        (
                                            prediction.label ==
                                                "Unshaded_Bubble" &&
                                            coverageRole ==
                                                "unshaded" &&
                                            normalizedCoverageRole ==
                                                "unshaded" &&
                                            quickCrossPrecheck?.plausibleCross !=
                                                true
                                        )

                                    val shouldRunFullCross =
                                        (
                                            ladderRoute ==
                                                "cross_verification"
                                        )

                                    val crossScore: Double
                                    val crossState: String
                                    val crossDiagonalBalance: Double
                                    val crossBackgroundDarkness: Double

                                    val resolverStartNs =
                                        android.os.SystemClock.elapsedRealtimeNanos()

                                    val resolution =
                                        when {
                                            directUnshadedAgreement -> {
                                                crossSkippedCount++

                                                crossScore =
                                                    0.0

                                                crossState =
                                                    "skipped_unshaded"

                                                crossDiagonalBalance =
                                                    0.0

                                                crossBackgroundDarkness =
                                                    0.0

                                                HybridBubbleResolution(
                                                    role =
                                                        "unshaded",

                                                    reason =
                                                        "direct_unshaded_agreement"
                                                )
                                            }

                                            shouldRunFullCross -> {
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

                                                crossDiagonalBalance =
                                                    crossResult.diagonalBalance

                                                crossBackgroundDarkness =
                                                    crossResult.backgroundDarkness

                                            resolveHybridBubbleRole50(
                                                cnnLabel =
                                                    prediction.label,

                                                cnnConfidence =
                                                    prediction.confidence.toDouble(),

                                                coverage =
                                                    coverageMeasurement.coverage,

                                                coverageRole =
                                                    coverageRole,

                                                coreCoverage =
                                                    coverageMeasurement.coreCoverage,

                                                minSectorCoverage =
                                                    coverageMeasurement.minSectorCoverage,

                                                sectorSpread =
                                                    coverageMeasurement.sectorSpread,

                                                minGridCoverage =
                                                    coverageMeasurement.minGridCoverage,

                                                gridSpread =
                                                    coverageMeasurement.gridSpread,

                                                minRadialCoverage =
                                                    coverageMeasurement.minRadialCoverage,

                                                radialSpread =
                                                    coverageMeasurement.radialSpread,

                                                markCentroidOffsetRatio =
                                                    coverageMeasurement.markCentroidOffsetRatio,

                                                normalizedCoverage =
                                                    normalizedCoverageMeasurement.coverage,

                                                normalizedCoverageRole =
                                                    normalizedCoverageRole,

                                                interiorCoverageNormal =
                                                    coverageMeasurement.interiorCoverageNormal,

                                                outlineBandCoverageNormal =
                                                    coverageMeasurement.outlineBandCoverageNormal,

                                                hasYoloProposal =
                                                    hasYoloProposal,

                                                crossScore =
                                                    crossScore,

                                                crossState =
                                                    crossState,

                                                sheetCalibration =
                                                    sheetBlankCalibration50,

                                                choiceCalibration =
                                                    sheetBlankCalibration50.choiceCalibrations[
                                                        choiceIndex
                                                    ]
                                            )
                                            }

                                            else -> {
                                                /*
                                                 * No cross evidence from either the CNN or the
                                                 * high-recall quick precheck. Skip the full
                                                 * CrossAnalyzer and let the existing frozen
                                                 * resolver evaluate shade/unshaded evidence.
                                                 */
                                                crossSkippedCount++

                                                crossScore =
                                                    0.0

                                                crossState =
                                                    "not_crossed"

                                                crossDiagonalBalance =
                                                    0.0

                                                crossBackgroundDarkness =
                                                    0.0

                                            resolveHybridBubbleRole50(
                                                cnnLabel =
                                                    prediction.label,

                                                cnnConfidence =
                                                    prediction.confidence.toDouble(),

                                                coverage =
                                                    coverageMeasurement.coverage,

                                                coverageRole =
                                                    coverageRole,

                                                coreCoverage =
                                                    coverageMeasurement.coreCoverage,

                                                minSectorCoverage =
                                                    coverageMeasurement.minSectorCoverage,

                                                sectorSpread =
                                                    coverageMeasurement.sectorSpread,

                                                minGridCoverage =
                                                    coverageMeasurement.minGridCoverage,

                                                gridSpread =
                                                    coverageMeasurement.gridSpread,

                                                minRadialCoverage =
                                                    coverageMeasurement.minRadialCoverage,

                                                radialSpread =
                                                    coverageMeasurement.radialSpread,

                                                markCentroidOffsetRatio =
                                                    coverageMeasurement.markCentroidOffsetRatio,

                                                normalizedCoverage =
                                                    normalizedCoverageMeasurement.coverage,

                                                normalizedCoverageRole =
                                                    normalizedCoverageRole,

                                                interiorCoverageNormal =
                                                    coverageMeasurement.interiorCoverageNormal,

                                                outlineBandCoverageNormal =
                                                    coverageMeasurement.outlineBandCoverageNormal,

                                                hasYoloProposal =
                                                    hasYoloProposal,

                                                crossScore =
                                                    crossScore,

                                                crossState =
                                                    crossState,

                                                sheetCalibration =
                                                    sheetBlankCalibration50,

                                                choiceCalibration =
                                                    sheetBlankCalibration50.choiceCalibrations[
                                                        choiceIndex
                                                    ]
                                            )
                                            }
                                        }

                                    val finalRole =
                                        resolution.role

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

                                        "review" ->
                                            reviewChoices.add(
                                                choice
                                            )
                                    }

                                    val bubbleRow =
                                        mutableMapOf<String, Any>(
                                            "choice" to choice,
                                            "finalRole" to finalRole,
                                            "resolutionReason" to resolution.reason,
                                        )

                                    resolution.invalidReason?.let {
                                        bubbleRow["invalidReason"] = it
                                    }

                                    resolution.shadeCompletenessScore?.let {
                                        bubbleRow["shadeCompletenessScore"] = it
                                        bubbleRow["shadeCompletenessThreshold"] = SHADE_COMPLETENESS_MIN
                                    }

                                    resolution.shadeEdgeReachRatio?.let {
                                        bubbleRow["shadeEdgeReachRatio"] = it
                                        bubbleRow["shadeEdgeReachMin"] = SHADE_VALID_MIN_EDGE_REACH
                                        bubbleRow["shadeRawSupportMin"] = SHADE_VALID_MIN_RAW_SUPPORT
                                    }

                                    /*
                                     * Keep detailed evidence only for exceptional bubbles so
                                     * the next real-device validation can explain WHY a bubble
                                     * became INVALID or REVIEW without bloating every row.
                                     */
                                    if (
                                        finalRole == "invalid" ||
                                        finalRole == "review"
                                    ) {
                                        bubbleRow["cnnLabel"] = prediction.label
                                        bubbleRow["cnnConfidence"] = prediction.confidence.toDouble()
                                        bubbleRow["hasYoloProposal"] = hasYoloProposal
                                        bubbleRow["coverage"] = coverageMeasurement.coverage
                                        bubbleRow["normalizedCoverage"] = normalizedCoverageMeasurement.coverage
                                        bubbleRow["coreCoverage"] = coverageMeasurement.coreCoverage
                                        bubbleRow["minSectorCoverage"] = coverageMeasurement.minSectorCoverage
                                        bubbleRow["sectorSpread"] = coverageMeasurement.sectorSpread
                                        bubbleRow["minGridCoverage"] = coverageMeasurement.minGridCoverage
                                        bubbleRow["gridSpread"] = coverageMeasurement.gridSpread
                                        bubbleRow["minRadialCoverage"] = coverageMeasurement.minRadialCoverage
                                        bubbleRow["radialSpread"] = coverageMeasurement.radialSpread
                                        bubbleRow["markCentroidOffsetRatio"] = coverageMeasurement.markCentroidOffsetRatio
                                        bubbleRow["crossState"] = crossState
                                        bubbleRow["crossScore"] = crossScore
                                    }

                                    bubbleRows.add(
                                        bubbleRow
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
                                        invalidChoices,

                                    reviewChoices =
                                        reviewChoices
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

                                    "selectedChoices" to
                                        interpretation.selectedChoices,

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

                                    "reviewChoices" to
                                        reviewChoices,

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

                                "illuminationNormalization" to
                                    illuminationNormalizationNs /
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

                                "crossQuickPrecheck" to
                                    quickCrossPrecheckNs /
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

                    illuminationNormalizedGray.release()

                    illuminationClahe?.collectGarbage()

                    image.release()
                }
            }
            /*
            |--------------------------------------------------------------------------
            | 100-Item Question Interpreter
            |--------------------------------------------------------------------------
            |
            | This is the 100-item counterpart of the adaptive 50-item hybrid
            | pipeline. Geometry/question count and bounded recovery calibration
            | remain format-specific:
            |
            |   CNN -> raw + illumination-normalized coverage -> optional cross
            |       -> adaptive resolver -> question interpretation
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

                val illuminationNormalizedGray =
                    Mat()

                var illuminationClahe:
                    org.opencv.imgproc.CLAHE? =
                    null

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

                    val illuminationNormalizationStartNs =
                        android.os.SystemClock.elapsedRealtimeNanos()

                    illuminationClahe =
                        Imgproc.createCLAHE(
                            ILLUMINATION_CLAHE_CLIP_LIMIT,
                            Size(
                                ILLUMINATION_CLAHE_TILE_GRID,
                                ILLUMINATION_CLAHE_TILE_GRID
                            )
                        )

                    illuminationClahe.apply(
                        gray,
                        illuminationNormalizedGray
                    )

                    val illuminationNormalizationNs =
                        android.os.SystemClock.elapsedRealtimeNanos() -
                            illuminationNormalizationStartNs

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

                    val yoloProposalCache100 =
                        lastYoloProposalCache
                            ?.takeIf { cache ->
                                cache.normalizedImageUri ==
                                    normalizedImageUri &&
                                    cache.questionCount ==
                                        QUESTION_COUNT_100
                            }
                            ?: throw Exception(
                                "YOLO proposals were not prepared for this 100-item sheet."
                            )

                    val yoloProposalSlots100 =
                        yoloProposalCache100.acceptedSlots

                    var ladderClearBlankCandidateCount = 0
                    var ladderMarkCandidateCount = 0
                    var ladderFillRouteCount = 0
                    var ladderCrossRouteCount = 0
                    var ladderUncertainRouteCount = 0

                    var quickCrossPrecheckCount = 0
                    var quickCrossPlausibleCount = 0
                    var quickCrossPrecheckNs = 0L

                    val questions =
                        mutableListOf<Map<String, Any?>>()

                    val statusCounts =
                        mutableMapOf(
                            "blank" to 0,
                            "selected" to 0,
                            "selected_with_correction" to 0,
                            "crossed_without_replacement" to 0,
                            "multiple" to 0,
                            "invalid" to 0,
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

                            val reviewChoices =
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

                                val preflightYoloSlotKey =
                                    bubbleSlotKey(
                                        question,
                                        choice
                                    )

                                val preflightHasYoloProposal =
                                    preflightYoloSlotKey in
                                        yoloProposalSlots100

                                var preflightQuickCross:
                                    CrossAnalyzer.QuickPrecheckResult? =
                                    null

                                if (!preflightHasYoloProposal) {
                                    val preflightQuickCrossStartNs =
                                        android.os.SystemClock.elapsedRealtimeNanos()

                                    val preflightResult =
                                        crossAnalyzer.quickPrecheck(
                                            normalizedImage = image,
                                            centerX = center.x,
                                            centerY = center.y,
                                        )

                                    preflightQuickCross =
                                        preflightResult

                                    quickCrossPrecheckNs +=
                                        android.os.SystemClock.elapsedRealtimeNanos() -
                                            preflightQuickCrossStartNs

                                    quickCrossPrecheckCount++

                                    if (preflightResult.plausibleCross) {
                                        quickCrossPlausibleCount++
                                    } else {
                                        ladderClearBlankCandidateCount++
                                        crossSkippedCount++

                                        bubbleRows.add(
                                            mapOf(
                                                "choice" to choice,
                                                "finalRole" to "unshaded",
                                                "hasYoloProposal" to false,
                                                "yoloConfidence" to 0.0,
                                                "quickCrossScore" to preflightResult.crossScore,
                                                "quickCrossPlausible" to false,
                                                "quickCrossDiagonalBalance" to preflightResult.diagonalBalance,
                                                "crossScore" to 0.0,
                                                "crossState" to "skipped_fast_blank",
                                                "crossDiagonalBalance" to 0.0,
                                                "crossBackgroundDarkness" to 0.0,
                                                "shadowLadderRoute" to "fast_blank",
                                                "shadowClearBlankCandidate" to true,
                                                "resolutionReason" to "yolo_absent_cross_precheck_clear",
                                            )
                                        )

                                        continue
                                    }
                                }

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

                                    val normalizedCoverageMeasurement =
                                        measureCoverage(
                                            gray =
                                                illuminationNormalizedGray,

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

                                    val normalizedCoverageRole =
                                        classifyCoverage(
                                            normalizedCoverageMeasurement.coverage
                                        )

                                    val hasYoloProposal =
                                        bubbleSlotKey(
                                            question,
                                            choice
                                        ) in
                                            yoloProposalSlots100

                                    val ladderClearBlankCandidate =
                                        isShadowClearBlankCandidate(
                                            coverageMeasurement =
                                                coverageMeasurement,
                                            hasYoloProposal =
                                                hasYoloProposal
                                        )

                                    val quickCrossPrecheck =
                                        preflightQuickCross
                                            ?: if (
                                                ladderClearBlankCandidate
                                            ) {
                                                null
                                            } else {
                                                val quickCrossStartNs =
                                                    android.os.SystemClock.elapsedRealtimeNanos()

                                                val result =
                                                    crossAnalyzer.quickPrecheck(
                                                        normalizedImage = image,
                                                        centerX = center.x,
                                                        centerY = center.y,
                                                    )

                                                quickCrossPrecheckNs +=
                                                    android.os.SystemClock.elapsedRealtimeNanos() -
                                                        quickCrossStartNs

                                                quickCrossPrecheckCount++

                                                if (result.plausibleCross) {
                                                    quickCrossPlausibleCount++
                                                }

                                                result
                                            }

                                    val ladderRoute =
                                        when {
                                            ladderClearBlankCandidate ->
                                                "clear_blank_fast_exit"

                                            quickCrossPrecheck?.plausibleCross ==
                                                true ||
                                                prediction.label ==
                                                    "Crossed_Bubble" ->
                                                "cross_verification"

                                            prediction.label ==
                                                "Shaded_Bubble" ||
                                                hasYoloProposal ->
                                                "fill_validation"

                                            else ->
                                                "uncertain_candidate"
                                        }

                                    if (ladderClearBlankCandidate) {
                                        ladderClearBlankCandidateCount++
                                    } else {
                                        ladderMarkCandidateCount++
                                    }

                                    when (ladderRoute) {
                                        "fill_validation" -> ladderFillRouteCount++
                                        "cross_verification" -> ladderCrossRouteCount++
                                        "uncertain_candidate" -> ladderUncertainRouteCount++
                                    }

                                    /*
                                     * Checkpoint 4.6 selective cross execution.
                                     *
                                     * YOLO and the cheap cross precheck decide whether the
                                     * expensive geometric CrossAnalyzer is actually needed.
                                     * Ordinary shade-like candidates still use CNN + coverage,
                                     * but they are resolved with crossState=not_crossed when
                                     * neither the CNN nor quick precheck sees cross evidence.
                                     */
                                    val directUnshadedAgreement =
                                        (
                                            prediction.label ==
                                                "Unshaded_Bubble" &&
                                            coverageRole ==
                                                "unshaded" &&
                                            normalizedCoverageRole ==
                                                "unshaded" &&
                                            quickCrossPrecheck?.plausibleCross !=
                                                true
                                        )

                                    val shouldRunFullCross =
                                        (
                                            ladderRoute ==
                                                "cross_verification"
                                        )

                                    val crossScore: Double
                                    val crossState: String
                                    val crossDiagonalBalance: Double
                                    val crossBackgroundDarkness: Double

                                    val resolverStartNs =
                                        android.os.SystemClock.elapsedRealtimeNanos()

                                    val resolution =
                                        when {
                                            directUnshadedAgreement -> {
                                                crossSkippedCount++

                                                crossScore =
                                                    0.0

                                                crossState =
                                                    "skipped_unshaded"

                                                crossDiagonalBalance =
                                                    0.0

                                                crossBackgroundDarkness =
                                                    0.0

                                                HybridBubbleResolution(
                                                    role =
                                                        "unshaded",

                                                    reason =
                                                        "direct_unshaded_agreement"
                                                )
                                            }

                                            shouldRunFullCross -> {
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

                                                crossDiagonalBalance =
                                                    crossResult.diagonalBalance

                                                crossBackgroundDarkness =
                                                    crossResult.backgroundDarkness

                                            resolveHybridBubbleRole100(
                                                cnnLabel =
                                                    prediction.label,

                                                cnnConfidence =
                                                    prediction.confidence.toDouble(),

                                                coverage =
                                                    coverageMeasurement.coverage,

                                                coverageRole =
                                                    coverageRole,

                                                interiorCoverageNormal =
                                                    coverageMeasurement.interiorCoverageNormal,

                                                outlineBandCoverageNormal =
                                                    coverageMeasurement.outlineBandCoverageNormal,

                                                normalizedCoverage =
                                                    normalizedCoverageMeasurement.coverage,

                                                normalizedCoverageRole =
                                                    normalizedCoverageRole,

                                                hasYoloProposal =
                                                    hasYoloProposal,

                                                crossState =
                                                    crossState
                                            )
                                            }

                                            else -> {
                                                /*
                                                 * No cross evidence from either the CNN or the
                                                 * high-recall quick precheck. Skip the full
                                                 * CrossAnalyzer and let the existing frozen
                                                 * resolver evaluate shade/unshaded evidence.
                                                 */
                                                crossSkippedCount++

                                                crossScore =
                                                    0.0

                                                crossState =
                                                    "not_crossed"

                                                crossDiagonalBalance =
                                                    0.0

                                                crossBackgroundDarkness =
                                                    0.0

                                            resolveHybridBubbleRole100(
                                                cnnLabel =
                                                    prediction.label,

                                                cnnConfidence =
                                                    prediction.confidence.toDouble(),

                                                coverage =
                                                    coverageMeasurement.coverage,

                                                coverageRole =
                                                    coverageRole,

                                                interiorCoverageNormal =
                                                    coverageMeasurement.interiorCoverageNormal,

                                                outlineBandCoverageNormal =
                                                    coverageMeasurement.outlineBandCoverageNormal,

                                                normalizedCoverage =
                                                    normalizedCoverageMeasurement.coverage,

                                                normalizedCoverageRole =
                                                    normalizedCoverageRole,

                                                hasYoloProposal =
                                                    hasYoloProposal,

                                                crossState =
                                                    crossState
                                            )
                                            }
                                        }

                                    val finalRole =
                                        resolution.role

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

                                        "review" ->
                                            reviewChoices.add(
                                                choice
                                            )
                                    }

                                    val bubbleRow =
                                        mutableMapOf<String, Any>(
                                            "choice" to choice,
                                            "finalRole" to finalRole,
                                            "resolutionReason" to resolution.reason,
                                        )

                                    resolution.invalidReason?.let {
                                        bubbleRow["invalidReason"] = it
                                    }

                                    resolution.shadeCompletenessScore?.let {
                                        bubbleRow["shadeCompletenessScore"] = it
                                        bubbleRow["shadeCompletenessThreshold"] = SHADE_COMPLETENESS_MIN
                                    }

                                    resolution.shadeEdgeReachRatio?.let {
                                        bubbleRow["shadeEdgeReachRatio"] = it
                                        bubbleRow["shadeEdgeReachMin"] = SHADE_VALID_MIN_EDGE_REACH
                                        bubbleRow["shadeRawSupportMin"] = SHADE_VALID_MIN_RAW_SUPPORT
                                    }

                                    bubbleRows.add(
                                        bubbleRow
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
                                        invalidChoices,

                                    reviewChoices =
                                        reviewChoices
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

                                    "selectedChoices" to
                                        interpretation.selectedChoices,

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

                                    "reviewChoices" to
                                        reviewChoices,

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

                                "illuminationNormalization" to
                                    illuminationNormalizationNs /
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

                                "crossQuickPrecheck" to
                                    quickCrossPrecheckNs /
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

                    illuminationNormalizedGray.release()

                    illuminationClahe?.collectGarbage()

                    image.release()
                }
            }
        }

    /*
    |--------------------------------------------------------------------------
    | Adaptive Hybrid Bubble Resolver
    |--------------------------------------------------------------------------
    |
    | Raw calibrated coverage remains authoritative. The second CLAHE-normalized
    | coverage pass is only corroborating evidence for borderline cases.
    |
    | Review is therefore reserved for unresolved disagreement rather than every
    | small lighting-induced deviation from a hard threshold.
    |--------------------------------------------------------------------------
    */

    private data class SignalProfileSummary50(
        val sampleCount: Int,
        val localBackgroundMedian: Double,
        val localBackgroundP10: Double,
        val localBackgroundP90: Double,
        val localBackgroundSpread: Double,
        val localBackgroundNoiseMedian: Double,
        val localBackgroundRobustSpreadMedian: Double,
        val interiorRelativeDarknessMeanMedian: Double,
        val interiorRelativeDarknessMedianMedian: Double,
        val interiorCoverageWeakMedian: Double,
        val interiorCoverageNormalMedian: Double,
        val interiorCoverageStrongMedian: Double,
        val interiorCoverageVeryStrongMedian: Double,
        val outlineBandCoverageNormalMedian: Double
    )

    private fun buildSignalProfileSummary50(
        measurements: List<CoverageMeasurement>
    ): SignalProfileSummary50 {

        if (
            measurements.isEmpty()
        ) {
            return SignalProfileSummary50(
                sampleCount = 0,
                localBackgroundMedian = 0.0,
                localBackgroundP10 = 0.0,
                localBackgroundP90 = 0.0,
                localBackgroundSpread = 0.0,
                localBackgroundNoiseMedian = 0.0,
                localBackgroundRobustSpreadMedian = 0.0,
                interiorRelativeDarknessMeanMedian = 0.0,
                interiorRelativeDarknessMedianMedian = 0.0,
                interiorCoverageWeakMedian = 0.0,
                interiorCoverageNormalMedian = 0.0,
                interiorCoverageStrongMedian = 0.0,
                interiorCoverageVeryStrongMedian = 0.0,
                outlineBandCoverageNormalMedian = 0.0
            )
        }

        val localBackgrounds =
            measurements.map {
                it.backgroundMedian
            }

        val localBackgroundP10 =
            percentile(
                localBackgrounds,
                0.10
            )

        val localBackgroundP90 =
            percentile(
                localBackgrounds,
                0.90
            )

        return SignalProfileSummary50(
            sampleCount =
                measurements.size,

            localBackgroundMedian =
                median(
                    localBackgrounds
                ),

            localBackgroundP10 =
                localBackgroundP10,

            localBackgroundP90 =
                localBackgroundP90,

            localBackgroundSpread =
                localBackgroundP90 -
                    localBackgroundP10,

            localBackgroundNoiseMedian =
                median(
                    measurements.map {
                        it.backgroundStdDev
                    }
                ),

            localBackgroundRobustSpreadMedian =
                median(
                    measurements.map {
                        it.backgroundRobustSpread
                    }
                ),

            interiorRelativeDarknessMeanMedian =
                median(
                    measurements.map {
                        it.interiorRelativeDarknessMean
                    }
                ),

            interiorRelativeDarknessMedianMedian =
                median(
                    measurements.map {
                        it.interiorRelativeDarknessMedian
                    }
                ),

            interiorCoverageWeakMedian =
                median(
                    measurements.map {
                        it.interiorCoverageWeak
                    }
                ),

            interiorCoverageNormalMedian =
                median(
                    measurements.map {
                        it.interiorCoverageNormal
                    }
                ),

            interiorCoverageStrongMedian =
                median(
                    measurements.map {
                        it.interiorCoverageStrong
                    }
                ),

            interiorCoverageVeryStrongMedian =
                median(
                    measurements.map {
                        it.interiorCoverageVeryStrong
                    }
                ),

            outlineBandCoverageNormalMedian =
                median(
                    measurements.map {
                        it.outlineBandCoverageNormal
                    }
                )
        )
    }

    private data class ChoiceBlankCalibration50(
        val choice: String,
        val rawCoverageMedian: Double,
        val effectiveUnshadedRecoveryMax: Double,
        val sampleCount: Int
    )

    private data class SheetBlankCalibration50(
        val rawCoverageMedian: Double,
        val effectiveUnshadedRecoveryMax: Double,
        val sampleCount: Int,
        val choiceCalibrations: List<ChoiceBlankCalibration50>
    )

    private fun buildSheetBlankCalibration50(
        rawMeasurements: List<CoverageMeasurement>
    ): SheetBlankCalibration50 {

        if (
            rawMeasurements.isEmpty()
        ) {

            val fallbackChoices =
                (0 until 5).map {
                    choiceIndex ->

                    ChoiceBlankCalibration50(
                        choice =
                            ('A'.code +
                                choiceIndex)
                                .toChar()
                                .toString(),

                        rawCoverageMedian =
                            UNSHADED_MAX,

                        effectiveUnshadedRecoveryMax =
                            BASELINE_UNSHADED_RECOVERY_MAX_50,

                        sampleCount =
                            0
                    )
                }

            return SheetBlankCalibration50(
                rawCoverageMedian =
                    UNSHADED_MAX,

                effectiveUnshadedRecoveryMax =
                    BASELINE_UNSHADED_RECOVERY_MAX_50,

                sampleCount =
                    0,

                choiceCalibrations =
                    fallbackChoices
            )
        }

        val rawCoverageMedian =
            median(
                rawMeasurements.map {
                    it.coverage
                }
            )

        val effectiveUnshadedRecoveryMax =
            (
                rawCoverageMedian +
                    SHEET_BLANK_RECOVERY_MARGIN_50
                ).coerceIn(
                    BASELINE_UNSHADED_RECOVERY_MAX_50,
                    SHEET_ADAPTIVE_UNSHADED_HARD_MAX_50
                )

        /*
         * Per-choice/lane calibration. The no-flash control scans repeatedly
         * showed one printed choice lane (especially B) reading darker across
         * many otherwise-clean questions. A single sheet median cannot model
         * that spatial bias.
         *
         * To avoid selected answers contaminating a lane baseline, each lane is
         * calibrated only from the lower-coverage population near the global
         * blank distribution. If there are too few candidates we fall back to
         * the sheet-wide baseline.
         */
        val blankCandidateCeiling =
            min(
                0.50,
                rawCoverageMedian +
                    SHEET_LANE_BLANK_CANDIDATE_MARGIN_50
            )

        val choiceCalibrations =
            (0 until 5).map {
                choiceIndex ->

                val laneCandidates =
                    rawMeasurements
                        .filterIndexed {
                            index, measurement ->

                            index % 5 ==
                                choiceIndex &&
                                measurement.coverage <=
                                    blankCandidateCeiling
                        }
                        .map {
                            it.coverage
                        }

                val laneMedian =
                    if (
                        laneCandidates.size >=
                            SHEET_LANE_MIN_SAMPLE_COUNT_50
                    ) {
                        median(
                            laneCandidates
                        )
                    } else {
                        rawCoverageMedian
                    }

                val laneRecoveryMax =
                    max(
                        effectiveUnshadedRecoveryMax,
                        laneMedian +
                            SHEET_BLANK_RECOVERY_MARGIN_50
                    ).coerceIn(
                        BASELINE_UNSHADED_RECOVERY_MAX_50,
                        SHEET_ADAPTIVE_UNSHADED_HARD_MAX_50
                    )

                ChoiceBlankCalibration50(
                    choice =
                        ('A'.code +
                            choiceIndex)
                            .toChar()
                            .toString(),

                    rawCoverageMedian =
                        laneMedian,

                    effectiveUnshadedRecoveryMax =
                        laneRecoveryMax,

                    sampleCount =
                        laneCandidates.size
                )
            }

        return SheetBlankCalibration50(
            rawCoverageMedian =
                rawCoverageMedian,

            effectiveUnshadedRecoveryMax =
                effectiveUnshadedRecoveryMax,

            sampleCount =
                rawMeasurements.size,

            choiceCalibrations =
                choiceCalibrations
        )
    }

    private data class HybridBubbleResolution(
        val role: String,
        val reason: String,
        val invalidReason: String? = null,
        val shadeCompletenessScore: Double? = null,
        val shadeEdgeReachRatio: Double? = null
    )

    /*
     * Checkpoint 4.7A.1 shade policy.
     *
     * The old SHADED_MIN coverage threshold is retained as a low-level CV
     * signal for legacy recovery paths, but it is no longer the business rule
     * that decides whether a clearly shaded student mark is acceptable.
     *
     * A candidate reaches this policy only when:
     * - YOLO proposed meaningful physical ink,
     * - the CNN clearly classifies it as Shaded_Bubble,
     * - full cross verification did not identify a cross.
     *
     * The edge-reach ratio compares darkness in the outer usable band with the
     * interior darkness. A center-heavy partial mark therefore receives a lower
     * completeness score than a shade that reaches most of the bubble.
     */
    private fun resolveConfiguredShadePolicy(
        cnnLabel: String,
        cnnConfidence: Double,
        coverage: Double,
        interiorCoverageNormal: Double,
        outlineBandCoverageNormal: Double,
        hasYoloProposal: Boolean,
        crossState: String
    ): HybridBubbleResolution? {

        if (
            crossState != "not_crossed" ||
            !hasYoloProposal ||
            cnnLabel != "Shaded_Bubble" ||
            cnnConfidence < SHADE_POLICY_MIN_CNN_CONFIDENCE
        ) {
            return null
        }

        val edgeReachRatio =
            if (interiorCoverageNormal > 0.0) {
                (
                    outlineBandCoverageNormal /
                        interiorCoverageNormal
                    ).coerceIn(
                        0.0,
                        1.0
                    )
            } else {
                0.0
            }

        val shadeCompletenessScore =
            (
                SHADE_COMPLETENESS_DENSITY_WEIGHT *
                    coverage +
                SHADE_COMPLETENESS_EDGE_REACH_WEIGHT *
                    edgeReachRatio
                ).coerceIn(
                    0.0,
                    1.0
                )

        val validShade =
            coverage >=
                SHADE_VALID_MIN_RAW_SUPPORT &&
            edgeReachRatio >=
                SHADE_VALID_MIN_EDGE_REACH &&
            shadeCompletenessScore >=
                SHADE_COMPLETENESS_MIN

        return if (validShade) {
            HybridBubbleResolution(
                role = "shaded",
                reason = "acceptable_shade_completeness",
                shadeCompletenessScore = shadeCompletenessScore,
                shadeEdgeReachRatio = edgeReachRatio
            )
        } else {
            HybridBubbleResolution(
                role = "invalid",
                reason = "insufficient_shade",
                invalidReason = "insufficient_shade",
                shadeCompletenessScore = shadeCompletenessScore,
                shadeEdgeReachRatio = edgeReachRatio
            )
        }
    }

    /*
     * Review-precision morphology resolver for the 50-item student sheet.
     *
     * This rule intentionally runs only AFTER the normal high-confidence
     * configured shade policy. It never creates a valid shade; it can only
     * convert a would-be generic REVIEW into INVALID when GradeLens can already
     * explain the physical mark as a clearly incomplete shade attempt.
     *
     * Safeguards:
     * - possible/definite cross evidence is excluded;
     * - the bubble must be measurably above the adaptive blank envelope;
     * - CNN must provide shade/invalid mark support (never Unshaded_Bubble);
     * - the ordinary valid-shade business rule must fail; and
     * - at least two independent morphology tests must agree.
     */
    private fun resolveIncompleteShadeMorphology50(
        cnnLabel: String,
        cnnConfidence: Double,
        coverage: Double,
        coreCoverage: Double,
        minSectorCoverage: Double,
        sectorSpread: Double,
        minGridCoverage: Double,
        gridSpread: Double,
        minRadialCoverage: Double,
        radialSpread: Double,
        markCentroidOffsetRatio: Double,
        interiorCoverageNormal: Double,
        outlineBandCoverageNormal: Double,
        hasYoloProposal: Boolean,
        crossState: String,
        choiceCalibration: ChoiceBlankCalibration50
    ): HybridBubbleResolution? {

        if (crossState != "not_crossed") {
            return null
        }

        val classifierSupportsMark =
            (
                cnnLabel == "Shaded_Bubble" &&
                    cnnConfidence >= MORPHOLOGY_SHADE_MIN_CNN_CONFIDENCE_50
                ) ||
                (
                    cnnLabel == "Invalid_Bubble" &&
                        cnnConfidence >= MORPHOLOGY_INVALID_MIN_CNN_CONFIDENCE_50
                    )

        if (!classifierSupportsMark) {
            return null
        }

        val rawClearlyAboveBlank =
            coverage >=
                choiceCalibration.effectiveUnshadedRecoveryMax +
                    MORPHOLOGY_ABOVE_BLANK_MARGIN_50

        val coreClearlyMarked =
            coreCoverage >=
                MORPHOLOGY_CORE_MARK_MIN_50

        val yoloSupportedNonBlank =
            hasYoloProposal &&
                (
                    coverage > UNSHADED_MAX ||
                        coreCoverage > SHEET_ADAPTIVE_UNSHADED_MAX_CORE_COVERAGE_50
                    )

        if (
            !rawClearlyAboveBlank &&
            !coreClearlyMarked &&
            !yoloSupportedNonBlank
        ) {
            return null
        }

        val edgeReachRatio =
            if (interiorCoverageNormal > 0.0) {
                (
                    outlineBandCoverageNormal /
                        interiorCoverageNormal
                    ).coerceIn(0.0, 1.0)
            } else {
                0.0
            }

        val shadeCompletenessScore =
            (
                SHADE_COMPLETENESS_DENSITY_WEIGHT * coverage +
                    SHADE_COMPLETENESS_EDGE_REACH_WEIGHT * edgeReachRatio
                ).coerceIn(0.0, 1.0)

        val alreadyValidByBusinessRule =
            coverage >= SHADE_VALID_MIN_RAW_SUPPORT &&
                edgeReachRatio >= SHADE_VALID_MIN_EDGE_REACH &&
                shadeCompletenessScore >= SHADE_COMPLETENESS_MIN

        if (alreadyValidByBusinessRule) {
            return null
        }

        var morphologyVotes = 0

        if (edgeReachRatio < MORPHOLOGY_EDGE_REACH_LOW_50) {
            morphologyVotes++
        }

        if (sectorSpread >= MORPHOLOGY_SECTOR_SPREAD_HIGH_50) {
            morphologyVotes++
        }

        if (gridSpread >= MORPHOLOGY_GRID_SPREAD_HIGH_50) {
            morphologyVotes++
        }

        if (radialSpread >= MORPHOLOGY_RADIAL_SPREAD_HIGH_50) {
            morphologyVotes++
        }

        if (markCentroidOffsetRatio >= MORPHOLOGY_CENTROID_OFFSET_HIGH_50) {
            morphologyVotes++
        }

        if (
            minGridCoverage <= MORPHOLOGY_MIN_GRID_HOLE_MAX_50 &&
            coreClearlyMarked
        ) {
            morphologyVotes++
        }

        /*
         * minSectorCoverage/minRadialCoverage are intentionally retained as
         * diagnostics rather than single hard gates. A low minimum can be
         * produced by local lighting/camera resampling; the spread-based votes
         * above require evidence of actual imbalance before auto-invalidating.
         */
        @Suppress("UNUSED_VARIABLE")
        val morphologyDiagnosticFloor =
            minOf(
                minSectorCoverage,
                minRadialCoverage
            )

        if (morphologyVotes < MORPHOLOGY_REQUIRED_INVALID_VOTES_50) {
            return null
        }

        return HybridBubbleResolution(
            role = "invalid",
            reason = "incomplete_shade_morphology",
            invalidReason = "insufficient_shade",
            shadeCompletenessScore = shadeCompletenessScore,
            shadeEdgeReachRatio = edgeReachRatio
        )
    }

    private fun resolveHybridBubbleRole50(
        cnnLabel: String,
        cnnConfidence: Double,
        coverage: Double,
        coverageRole: String,
        coreCoverage: Double,
        minSectorCoverage: Double,
        sectorSpread: Double,
        minGridCoverage: Double,
        gridSpread: Double,
        minRadialCoverage: Double,
        radialSpread: Double,
        markCentroidOffsetRatio: Double,
        normalizedCoverage: Double,
        normalizedCoverageRole: String,
        interiorCoverageNormal: Double,
        outlineBandCoverageNormal: Double,
        hasYoloProposal: Boolean,
        crossScore: Double,
        crossState: String,
        sheetCalibration: SheetBlankCalibration50,
        choiceCalibration: ChoiceBlankCalibration50
    ): HybridBubbleResolution {

        /*
         * Sheet-adaptive Rule A:
         * Raw coverage already says blank, geometry says no cross, and the CNN
         * only weakly votes Invalid. CLAHE frequently makes the printed bubble
         * outline darker, so its invalid result must not override the calibrated
         * raw blank measurement in this narrow case.
         */
        if (
            crossState ==
                "not_crossed" &&
            coverageRole ==
                "unshaded" &&
            normalizedCoverageRole !=
                "shaded" &&
            cnnLabel ==
                "Invalid_Bubble" &&
            cnnConfidence <=
                CNN_INVALID_BLANK_RECOVERY_MAX_CONFIDENCE_50
        ) {

            return HybridBubbleResolution(
                role =
                    "unshaded",

                reason =
                    "raw_unshaded_weak_cnn_invalid_recovery"
            )
        }

        /*
         * Checkpoint 6 Rule B0:
         * High-confidence raw blank recovery.
         *
         * The clean no-flash control showed a repeatable class of false review
         * bubbles where the raw density moved only slightly above the frozen
         * 0.35 blank threshold, the CNN was overwhelmingly Unshaded, and the
         * cross detector was clean. Per-sheet medians can still stay near the
         * normal baseline because most of the 250 bubbles are lighter, so this
         * narrow safety valve is intentionally independent of the lane median.
         *
         * CLAHE coverage is not used as a same-threshold veto here because the
         * enhanced image also strengthens the printed bubble outline. A truly
         * dark normalized result (>= SHADED_MIN) is still excluded.
         */
        if (
            crossState ==
                "not_crossed" &&
            coverageRole ==
                "invalid" &&
            coverage <=
                HIGH_CONFIDENCE_UNSHADED_RECOVERY_MAX_50 &&
            normalizedCoverageRole !=
                "shaded" &&
            cnnLabel ==
                "Unshaded_Bubble" &&
            cnnConfidence >=
                HIGH_CONFIDENCE_UNSHADED_RECOVERY_MIN_CONFIDENCE_50
        ) {

            return HybridBubbleResolution(
                role =
                    "unshaded",

                reason =
                    "high_confidence_unshaded_recovery"
            )
        }

        /*
         * Review-precision Rule B-1: strong physical blank evidence.
         *
         * After restoring detailed analysis for all 50-item bubbles, clean blank
         * bubbles can occasionally receive a CNN Invalid_Bubble prediction from
         * the printed outline. That disagreement must not become faculty review
         * when the physical CV evidence itself is strongly blank:
         *
         * - YOLO found no meaningful student ink,
         * - cross geometry is clean,
         * - raw coverage is within this sheet/lane's adaptive blank band,
         * - the bubble core is still light, and
         * - illumination-normalized coverage is not clearly shaded.
         *
         * A strong CNN Shaded_Bubble prediction is intentionally NOT suppressed;
         * that is a genuine detector conflict and may still require review.
         */
        val strongPhysicalBlankEvidence =
            !hasYoloProposal &&
            crossState ==
                "not_crossed" &&
            coverage <=
                choiceCalibration.effectiveUnshadedRecoveryMax &&
            coreCoverage <=
                SHEET_ADAPTIVE_UNSHADED_MAX_CORE_COVERAGE_50 &&
            normalizedCoverageRole !=
                "shaded"

        if (
            strongPhysicalBlankEvidence &&
            !(
                cnnLabel ==
                    "Shaded_Bubble" &&
                cnnConfidence >=
                    SHADE_POLICY_MIN_CNN_CONFIDENCE
                )
        ) {
            return HybridBubbleResolution(
                role = "unshaded",
                reason = "physical_blank_evidence_recovery"
            )
        }

        val strongSheetBlankEvidence =
            coverageRole ==
                "invalid" &&
            coverage <=
                choiceCalibration.effectiveUnshadedRecoveryMax &&
            coreCoverage <=
                SHEET_ADAPTIVE_UNSHADED_MAX_CORE_COVERAGE_50 &&
            normalizedCoverageRole !=
                "shaded" &&
            cnnLabel ==
                "Unshaded_Bubble" &&
            cnnConfidence >=
                SHEET_ADAPTIVE_UNSHADED_MIN_CONFIDENCE_50

        /*
         * Sheet-adaptive Rule B:
         * In darker no-flash captures, the whole blank population moves upward
         * (for example from ~0.35 to ~0.38-0.41) while the CNN remains strongly
         * Unshaded and cross geometry remains clean. Recover those bubbles
         * against the bounded per-sheet baseline instead of a fixed global
         * threshold.
         */
        if (
            strongSheetBlankEvidence &&
            crossState ==
                "not_crossed"
        ) {

            return HybridBubbleResolution(
                role =
                    "unshaded",

                reason =
                    "sheet_adaptive_unshaded_recovery"
            )
        }

        /*
         * Sheet-adaptive Rule C:
         * A weak possible-cross can be lighting/outline noise. Suppress it only
         * when (1) the sheet-wide blank median itself is darker than the frozen
         * blank threshold, (2) CNN confidence is overwhelming, (3) raw coverage
         * fits the bounded sheet baseline, and (4) the cross score is still in
         * the lower half of the possible-cross band. Definite/stronger crosses
         * remain untouched.
         */
        if (
            strongSheetBlankEvidence &&
            (
                sheetCalibration.rawCoverageMedian >
                    UNSHADED_MAX ||
                choiceCalibration.rawCoverageMedian >
                    UNSHADED_MAX
                ) &&
            cnnConfidence >=
                WEAK_POSSIBLE_CROSS_MIN_UNSHADED_CONFIDENCE_50 &&
            crossState ==
                "possible_cross" &&
            crossScore <
                WEAK_POSSIBLE_CROSS_MAX_SCORE_50
        ) {

            return HybridBubbleResolution(
                role =
                    "unshaded",

                reason =
                    "sheet_adaptive_weak_possible_cross_recovery"
            )
        }

        /*
         * Checkpoint 4.7A.1 Rule D: business shade completeness + edge-reach guard.
         *
         * A clearly detected shade is now resolved as either VALID_SHADED
         * (internal role "shaded") or INVALID/insufficient_shade. It is no
         * longer sent to REVIEW simply because the legacy raw coverage sits in
         * the old 0.35-0.85 middle band.
         */
        /*
         * YOLO is a proposal signal, not the academic rule itself. A clear shade
         * attempt may still be physically measurable even when YOLO misses it.
         * Allow the configured shade-completeness policy to run when either YOLO
         * proposed ink OR the raw/core measurements are already outside the
         * adaptive blank envelope. This lets clear partial shades resolve to
         * INVALID instead of REVIEW while preserving REVIEW for contradictory
         * evidence near the blank boundary.
         */
        val hasMeaningfulPhysicalMarkEvidence =
            hasYoloProposal ||
            coverage >
                choiceCalibration.effectiveUnshadedRecoveryMax ||
            coreCoverage >
                SHEET_ADAPTIVE_UNSHADED_MAX_CORE_COVERAGE_50

        val configuredShadeResolution =
            resolveConfiguredShadePolicy(
                cnnLabel = cnnLabel,
                cnnConfidence = cnnConfidence,
                coverage = coverage,
                interiorCoverageNormal = interiorCoverageNormal,
                outlineBandCoverageNormal = outlineBandCoverageNormal,
                hasYoloProposal = hasMeaningfulPhysicalMarkEvidence,
                crossState = crossState
            )

        if (configuredShadeResolution != null) {
            return configuredShadeResolution
        }

        /*
         * Morphology-based INVALID rescue.
         *
         * At this point the normal configured shade policy could not make a
         * high-confidence decision. Before falling into the generic adaptive
         * resolver / REVIEW fallback, use the detailed fill-shape measurements
         * that GradeLens already calculates. A clearly partial/non-uniform shade
         * can therefore be explained as an understood rule violation instead of
         * consuming faculty review.
         */
        val morphologyInvalidResolution =
            resolveIncompleteShadeMorphology50(
                cnnLabel = cnnLabel,
                cnnConfidence = cnnConfidence,
                coverage = coverage,
                coreCoverage = coreCoverage,
                minSectorCoverage = minSectorCoverage,
                sectorSpread = sectorSpread,
                minGridCoverage = minGridCoverage,
                gridSpread = gridSpread,
                minRadialCoverage = minRadialCoverage,
                radialSpread = radialSpread,
                markCentroidOffsetRatio = markCentroidOffsetRatio,
                interiorCoverageNormal = interiorCoverageNormal,
                outlineBandCoverageNormal = outlineBandCoverageNormal,
                hasYoloProposal = hasYoloProposal,
                crossState = crossState,
                choiceCalibration = choiceCalibration
            )

        if (morphologyInvalidResolution != null) {
            return morphologyInvalidResolution
        }

        return resolveAdaptiveHybridBubbleRole(
            cnnLabel =
                cnnLabel,

            cnnConfidence =
                cnnConfidence,

            coverage =
                coverage,

            coverageRole =
                coverageRole,

            normalizedCoverage =
                normalizedCoverage,

            normalizedCoverageRole =
                normalizedCoverageRole,

            crossState =
                crossState,

            baselineUnshadedRecoveryMax =
                BASELINE_UNSHADED_RECOVERY_MAX_50,

            baselineUnshadedRecoveryMinConfidence =
                BASELINE_UNSHADED_RECOVERY_MIN_CONFIDENCE_50,

            unshadedRecoveryMax =
                UNSHADED_RECOVERY_MAX_50,

            unshadedRecoveryMinConfidence =
                CNN_UNSHADED_RECOVERY_MIN_CONFIDENCE_50,

            allowIlluminationShadedRecovery =
                false
        )
    }

    private fun resolveHybridBubbleRole100(
        cnnLabel: String,
        cnnConfidence: Double,
        coverage: Double,
        coverageRole: String,
        interiorCoverageNormal: Double,
        outlineBandCoverageNormal: Double,
        normalizedCoverage: Double,
        normalizedCoverageRole: String,
        hasYoloProposal: Boolean,
        crossState: String
    ): HybridBubbleResolution {

        val configuredShadeResolution =
            resolveConfiguredShadePolicy(
                cnnLabel = cnnLabel,
                cnnConfidence = cnnConfidence,
                coverage = coverage,
                interiorCoverageNormal = interiorCoverageNormal,
                outlineBandCoverageNormal = outlineBandCoverageNormal,
                hasYoloProposal = hasYoloProposal,
                crossState = crossState
            )

        if (configuredShadeResolution != null) {
            return configuredShadeResolution
        }

        return resolveAdaptiveHybridBubbleRole(
            cnnLabel = cnnLabel,
            cnnConfidence = cnnConfidence,
            coverage = coverage,
            coverageRole = coverageRole,
            normalizedCoverage = normalizedCoverage,
            normalizedCoverageRole = normalizedCoverageRole,
            crossState = crossState,
            baselineUnshadedRecoveryMax = BASELINE_UNSHADED_RECOVERY_MAX_100,
            baselineUnshadedRecoveryMinConfidence = CNN_UNSHADED_RECOVERY_MIN_CONFIDENCE_100,
            unshadedRecoveryMax = UNSHADED_RECOVERY_MAX_100,
            unshadedRecoveryMinConfidence = CNN_UNSHADED_RECOVERY_MIN_CONFIDENCE_100,
            allowIlluminationShadedRecovery = true
        )
    }

    private fun resolveAdaptiveHybridBubbleRole(
        cnnLabel: String,
        cnnConfidence: Double,
        coverage: Double,
        coverageRole: String,
        normalizedCoverage: Double,
        normalizedCoverageRole: String,
        crossState: String,
        baselineUnshadedRecoveryMax: Double,
        baselineUnshadedRecoveryMinConfidence: Double,
        unshadedRecoveryMax: Double,
        unshadedRecoveryMinConfidence: Double,
        allowIlluminationShadedRecovery: Boolean
    ): HybridBubbleResolution {

        /*
         * Rule 1:
         * A definite geometric cross has highest priority.
         */
        if (
            crossState ==
                "definite_cross"
        ) {

            return HybridBubbleResolution(
                role =
                    "crossed",

                reason =
                    "definite_cross"
            )
        }

        /*
         * Rule 2:
         * Direct CNN + raw calibrated coverage agreement is accepted.
         */
        if (
            crossState ==
                "not_crossed" &&
            cnnLabel ==
                "Shaded_Bubble" &&
            coverageRole ==
                "shaded"
        ) {

            return HybridBubbleResolution(
                role =
                    "shaded",

                reason =
                    "direct_shaded_agreement"
            )
        }

        if (
            cnnLabel ==
                "Unshaded_Bubble" &&
            coverageRole ==
                "unshaded"
        ) {

            return HybridBubbleResolution(
                role =
                    "unshaded",

                reason =
                    "direct_unshaded_agreement"
            )
        }

        /*
         * Rule 3:
         * A CNN Invalid label does not force review when raw coverage and the
         * illumination-normalized pass independently agree and geometry finds
         * no cross.
         */
        if (
            crossState ==
                "not_crossed" &&
            cnnLabel ==
                "Invalid_Bubble" &&
            coverageRole ==
                "unshaded" &&
            normalizedCoverage <=
                unshadedRecoveryMax
        ) {

            return HybridBubbleResolution(
                role =
                    "unshaded",

                reason =
                    "dual_coverage_unshaded_recovery"
            )
        }

        if (
            crossState ==
                "not_crossed" &&
            cnnLabel ==
                "Invalid_Bubble" &&
            coverageRole ==
                "shaded" &&
            normalizedCoverage >=
                SHADED_MIN
        ) {

            return HybridBubbleResolution(
                role =
                    "shaded",

                reason =
                    "dual_coverage_shaded_recovery"
            )
        }

        /*
         * Rule 4:
         * Narrow RAW-coverage blank recovery.
         *
         * Real clean-sheet captures showed a stable false-invalid cluster only
         * a few thousandths above UNSHADED_MAX. In those cases the CNN said
         * Unshaded_Bubble and cross geometry said not_crossed, while CLAHE
         * increased apparent darkness because it also enhances the printed
         * bubble outline. Therefore normalizedCoverage is deliberately NOT a
         * gate for this narrow blank recovery.
         *
         * This rule is asymmetric on purpose: it only rescues likely blanks.
         * Mid-coverage CNN-Shaded marks (for example partial / half shading) are
         * not promoted to shaded here and remain review-worthy.
         */
        if (
            crossState ==
                "not_crossed" &&
            coverageRole ==
                "invalid" &&
            coverage <=
                baselineUnshadedRecoveryMax &&
            cnnLabel ==
                "Unshaded_Bubble" &&
            cnnConfidence >=
                baselineUnshadedRecoveryMinConfidence
        ) {

            return HybridBubbleResolution(
                role =
                    "unshaded",

                reason =
                    "raw_borderline_unshaded_recovery"
            )
        }

        /*
         * Higher borderline blank recovery remains more conservative. Beyond
         * the narrow baseline band, require stronger CNN confidence AND require
         * the normalized pass to stay within the bounded recovery area.
         */
        if (
            crossState ==
                "not_crossed" &&
            coverageRole ==
                "invalid" &&
            coverage <=
                unshadedRecoveryMax &&
            normalizedCoverage <=
                unshadedRecoveryMax &&
            cnnLabel ==
                "Unshaded_Bubble" &&
            cnnConfidence >=
                unshadedRecoveryMinConfidence
        ) {

            return HybridBubbleResolution(
                role =
                    "unshaded",

                reason =
                    "confident_unshaded_recovery"
            )
        }

        /*
         * Rule 5:
         * A partially dimmed but otherwise coherent shade may be recovered only
         * when normalized coverage clearly becomes shaded and the CNN is strongly
         * confident. A possible/definite cross is never recovered here.
         */
        if (
            allowIlluminationShadedRecovery &&
            crossState ==
                "not_crossed" &&
            coverageRole ==
                "invalid" &&
            coverage >=
                SHADED_RECOVERY_MIN_COVERAGE &&
            normalizedCoverage >=
                SHADED_MIN &&
            normalizedCoverageRole ==
                "shaded" &&
            cnnLabel ==
                "Shaded_Bubble" &&
            cnnConfidence >=
                CNN_SHADED_RECOVERY_MIN_CONFIDENCE
        ) {

            return HybridBubbleResolution(
                role =
                    "shaded",

                reason =
                    "illumination_shaded_recovery"
            )
        }

        /*
         * Rule 6:
         * Everything left here is genuinely unresolved physical evidence.
         * Checkpoint 4 exposes this explicitly as REVIEW rather than overloading
         * INVALID. INVALID is reserved for a confidently understood mark that
         * violates the marking rules.
         */
        return HybridBubbleResolution(
            role =
                "review",

            reason =
                "unresolved_signal_disagreement"
        )
    }

    /*
    |--------------------------------------------------------------------------
    | Interpreted Question Result
    |--------------------------------------------------------------------------
    */

    private data class QuestionInterpretation(
        /**
         * Legacy single-answer compatibility field.
         *
         * It is populated only when exactly one valid shaded choice remains.
         * Multiple-answer questions use selectedChoices as the authoritative
         * physical selection set.
         */
        val answer: String?,

        /**
         * Checkpoint 4.7B authoritative physical selection set.
         *
         * Mobile OMR does not decide whether this set is correct. It only
         * reports which choices remain actively selected after cross/invalid/
         * review semantics are applied. Laravel compares this set with the
         * authoritative correct-choice set later.
         */
        val selectedChoices: List<String>,

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
        invalidChoices: List<String>,
        reviewChoices: List<String>
    ): QuestionInterpretation {

        val invalidCount =
            invalidChoices.size

        val reviewCount =
            reviewChoices.size

        val selectedChoices =
            shadedChoices
                .distinct()
                .sorted()

        val shadedCount =
            selectedChoices.size

        val crossedCount =
            crossedChoices.size

        /*
         * Checkpoint 4.7B question semantics:
         *
         * 1. REVIEW has highest precedence because the machine cannot reliably
         *    determine at least one physical mark. Human assistance is needed.
         *
         * 2. INVALID means the physical mark was understood but violated the
         *    configured marking rule (for example insufficient shading). It is
         *    automatically scoreable as zero and does not need human review.
         *
         * 3. One OR MANY valid shaded choices are simply a physical selection
         *    set. Mobile must not decide that multiple selections are wrong.
         *    Laravel later compares selectedChoices with the authoritative
         *    correct-choice set.
         *
         * The legacy status "multiple" is therefore no longer emitted. It
         * remains in TypeScript/count contracts temporarily for stored payload
         * compatibility.
         */
        if (reviewCount > 0) {
            return QuestionInterpretation(
                answer = null,
                selectedChoices = emptyList(),
                status = if (reviewCount >= 3) "unreadable" else "ambiguous",
                qualityStatus = "review",
                needsReview = true
            )
        }

        if (invalidCount > 0) {
            return QuestionInterpretation(
                answer = null,
                selectedChoices = emptyList(),
                status = "invalid",
                qualityStatus = "accepted",
                needsReview = false
            )
        }

        if (shadedCount == 0 && crossedCount == 0) {
            return QuestionInterpretation(
                answer = null,
                selectedChoices = emptyList(),
                status = "blank",
                qualityStatus = "accepted",
                needsReview = false
            )
        }

        if (shadedCount == 0 && crossedCount > 0) {
            return QuestionInterpretation(
                answer = null,
                selectedChoices = emptyList(),
                status = "crossed_without_replacement",
                qualityStatus = "accepted",
                needsReview = false
            )
        }

        return QuestionInterpretation(
            answer = selectedChoices.singleOrNull(),
            selectedChoices = selectedChoices,
            status = if (crossedCount > 0) {
                "selected_with_correction"
            } else {
                "selected"
            },
            qualityStatus = "accepted",
            needsReview = false
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

    private data class CaptureQualityData(
        val accepted: Boolean,
        val reason: String,
        val sheetAreaRatio: Double,
        val minMarkerSidePx: Double,
        val widthOppositeEdgeRatio: Double,
        val heightOppositeEdgeRatio: Double
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

        val backgroundPixels: Int,

        val backgroundMean: Double,

        val backgroundStdDev: Double,

        val backgroundP10: Double,

        val backgroundP90: Double,

        val backgroundRobustSpread: Double,

        val interiorMeanLuminance: Double,

        val interiorMedianLuminance: Double,

        val interiorRelativeDarknessMean: Double,

        val interiorRelativeDarknessMedian: Double,

        val interiorCoverageWeak: Double,

        val interiorCoverageNormal: Double,

        val interiorCoverageStrong: Double,

        val interiorCoverageVeryStrong: Double,

        val strongToNormalPersistence: Double,

        val veryStrongToNormalPersistence: Double,

        val outlineBandCoverageNormal: Double,

        val coreCoverage: Double,

        val sectorCoverages: List<Double>,

        val minSectorCoverage: Double,

        val maxSectorCoverage: Double,

        val sectorSpread: Double,

        val grid3x3Coverages: List<Double>,

        val minGridCoverage: Double,

        val maxGridCoverage: Double,

        val gridSpread: Double,

        val radialCoverages: List<Double>,

        val minRadialCoverage: Double,

        val maxRadialCoverage: Double,

        val radialSpread: Double,

        val markCentroidOffsetRatio: Double
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

    private fun pointDistance(
        first: Point,
        second: Point
    ): Double {
        val dx =
            first.x - second.x

        val dy =
            first.y - second.y

        return sqrt(
            dx * dx +
                dy * dy
        )
    }

    private fun polygonArea(
        points: List<Point>
    ): Double {
        if (points.size < 3) {
            return 0.0
        }

        var twiceArea =
            0.0

        for (index in points.indices) {
            val current =
                points[index]

            val next =
                points[(index + 1) % points.size]

            twiceArea +=
                current.x * next.y -
                    next.x * current.y
        }

        return kotlin.math.abs(twiceArea) /
            2.0
    }

    private fun evaluateCaptureQuality(
        image: Mat,
        markerCorners: Map<Int, Array<Point>>
    ): CaptureQualityData {
        val marker0 =
            markerCorners[0]
                ?: return CaptureQualityData(false, "markers_missing", 0.0, 0.0, 0.0, 0.0)

        val marker1 =
            markerCorners[1]
                ?: return CaptureQualityData(false, "markers_missing", 0.0, 0.0, 0.0, 0.0)

        val marker2 =
            markerCorners[2]
                ?: return CaptureQualityData(false, "markers_missing", 0.0, 0.0, 0.0, 0.0)

        val marker3 =
            markerCorners[3]
                ?: return CaptureQualityData(false, "markers_missing", 0.0, 0.0, 0.0, 0.0)

        val topLeft = marker0[0]
        val topRight = marker1[1]
        val bottomRight = marker2[2]
        val bottomLeft = marker3[3]

        val topWidth =
            pointDistance(topLeft, topRight)

        val bottomWidth =
            pointDistance(bottomLeft, bottomRight)

        val leftHeight =
            pointDistance(topLeft, bottomLeft)

        val rightHeight =
            pointDistance(topRight, bottomRight)

        val widthOppositeEdgeRatio =
            min(topWidth, bottomWidth) /
                max(topWidth, bottomWidth).coerceAtLeast(1.0)

        val heightOppositeEdgeRatio =
            min(leftHeight, rightHeight) /
                max(leftHeight, rightHeight).coerceAtLeast(1.0)

        val sheetArea =
            polygonArea(
                listOf(
                    topLeft,
                    topRight,
                    bottomRight,
                    bottomLeft
                )
            )

        val imageArea =
            image.cols().toDouble() *
                image.rows().toDouble()

        val sheetAreaRatio =
            if (imageArea > 0.0) {
                sheetArea / imageArea
            } else {
                0.0
            }

        val markerSideLengths =
            listOf(marker0, marker1, marker2, marker3)
                .flatMap { marker ->
                    listOf(
                        pointDistance(marker[0], marker[1]),
                        pointDistance(marker[1], marker[2]),
                        pointDistance(marker[2], marker[3]),
                        pointDistance(marker[3], marker[0])
                    )
                }

        val minMarkerSidePx =
            markerSideLengths.minOrNull() ?:
                0.0

        val tooFar =
            sheetAreaRatio <
                CAPTURE_MIN_SHEET_AREA_RATIO ||
                minMarkerSidePx <
                    CAPTURE_MIN_MARKER_SIDE_PX

        val tooSkewed =
            widthOppositeEdgeRatio <
                CAPTURE_MIN_OPPOSITE_EDGE_RATIO ||
                heightOppositeEdgeRatio <
                    CAPTURE_MIN_OPPOSITE_EDGE_RATIO

        val reason =
            when {
                tooFar -> "too_far"
                tooSkewed -> "too_skewed"
                else -> "accepted"
            }

        return CaptureQualityData(
            accepted = !tooFar && !tooSkewed,
            reason = reason,
            sheetAreaRatio = sheetAreaRatio,
            minMarkerSidePx = minMarkerSidePx,
            widthOppositeEdgeRatio = widthOppositeEdgeRatio,
            heightOppositeEdgeRatio = heightOppositeEdgeRatio
        )
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
    | YOLO ROI Gate Visualization — Checkpoint 3
    |--------------------------------------------------------------------------
    |
    | The overlay is intentionally diagnostic-only:
    |
    |   small circles + A-E labels = known GradeLens template slots
    |   RED boxes                  = YOLO proposals ACCEPTED by ROI gate
    |   YELLOW boxes               = YOLO proposals IGNORED by ROI gate
    |
    | The template is NOT classifying the mark. It only provides the known
    | question/choice coordinate system after ArUco canonicalization.
    |--------------------------------------------------------------------------
    */

    private data class YoloDebugVisualization(
        val fullOverlayUri: String,
        val question: Int,
        val questionCropUri: String,
    )

    private fun bubbleSlotKey(
        question: Int,
        choice: String
    ): String =
        "$question:$choice"

    private fun isShadowClearBlankCandidate(
        coverageMeasurement: CoverageMeasurement,
        hasYoloProposal: Boolean
    ): Boolean {
        if (hasYoloProposal) {
            return false
        }

        return (
            coverageMeasurement.coverage <=
                LADDER_SHADOW_CLEAR_BLANK_MAX_COVERAGE &&
            coverageMeasurement.interiorCoverageNormal <=
                LADDER_SHADOW_CLEAR_BLANK_MAX_INTERIOR_NORMAL &&
            coverageMeasurement.interiorCoverageStrong <=
                LADDER_SHADOW_CLEAR_BLANK_MAX_INTERIOR_STRONG &&
            coverageMeasurement.coreCoverage <=
                LADDER_SHADOW_CLEAR_BLANK_MAX_CORE_COVERAGE
            )
    }

    /*
    |--------------------------------------------------------------------------
    | YOLO ROI Diagnostic Mapping
    |--------------------------------------------------------------------------
    |
    | The detector remains the visual ROI source for this diagnostic, while the
    | known GradeLens 5-choice geometry is used only to answer:
    |
    |   "Which expected Q#/A-E slot is this detected ROI closest to?"
    |
    | This prevents the old "sort every box and group each 5" failure mode where
    | one missed detection shifts every later question.
    |--------------------------------------------------------------------------
    */

    private data class ExpectedBubbleSlot(
        val question: Int,
        val choice: String,
        val center: Point,
    )

    private data class YoloGatedDetection(
        val detection: YoloBubbleDetector.Detection,
        val accepted: Boolean,
        val question: Int? = null,
        val choice: String? = null,
        val centerErrorMm: Double? = null,
        val rejectionReason: String? = null,
    )

    private data class YoloMappingResult(
        val expectedBubbleCount: Int,
        val matchedExpectedCount: Int,
        val missingExpectedCount: Int,
        val unmatchedDetectionCount: Int,
        val duplicateRejectedCount: Int,
        val matchedRatio: Double,
        val matchDistanceLimitMm: Double,
        val meanCenterErrorMm: Double,
        val medianCenterErrorMm: Double,
        val maxCenterErrorMm: Double,
        val matches: List<Map<String, Any>>,
        val sampleMatches: List<Map<String, Any>>,
        val worstMatches: List<Map<String, Any>>,
        val missingSlots: List<Map<String, Any>>,
        val gatedDetections: List<YoloGatedDetection>,
    )

    private fun mapYoloDetectionsToExpectedSlots(
        detections: List<YoloBubbleDetector.Detection>,
        questionCount: Int,
    ): YoloMappingResult {
        val expectedSlots =
            buildExpectedBubbleSlots(
                questionCount
            )

        val matchDistanceLimitMm =
            when (
                questionCount
            ) {
                QUESTION_COUNT_50 ->
                    min(
                        CHOICE_PITCH_MM_50,
                        ROW_PITCH_MM_50,
                    ) *
                        0.45

                QUESTION_COUNT_100 ->
                    min(
                        CHOICE_PITCH_MM_100,
                        ROW_PITCH_MM_100,
                    ) *
                        0.45

                else ->
                    throw IllegalArgumentException(
                        "Unsupported YOLO mapping question count: $questionCount"
                    )
            }

        val matchedSlotIndices =
            mutableSetOf<Int>()

        val matchRows =
            mutableListOf<Map<String, Any>>()

        val gatedDetections =
            mutableListOf<YoloGatedDetection>()

        var unmatchedDetectionCount =
            0

        var duplicateRejectedCount =
            0

        for (
            detection in
            detections.sortedByDescending {
                item ->
                item.confidence
            }
        ) {
            var nearestIndex =
                -1

            var nearestDistanceMm =
                Double.POSITIVE_INFINITY

            for (
                slotIndex in
                expectedSlots.indices
            ) {
                val slot =
                    expectedSlots[
                        slotIndex
                    ]

                val dxMm =
                    (
                        detection.centerX -
                            slot.center.x
                        ) /
                        NORMALIZED_WIDTH.toDouble() *
                        SHEET_WIDTH_MM

                val dyMm =
                    (
                        detection.centerY -
                            slot.center.y
                        ) /
                        NORMALIZED_HEIGHT.toDouble() *
                        SHEET_HEIGHT_MM

                val distanceMm =
                    sqrt(
                        (
                            dxMm *
                                dxMm
                            ) +
                            (
                                dyMm *
                                    dyMm
                                )
                    )

                if (
                    distanceMm <
                    nearestDistanceMm
                ) {
                    nearestDistanceMm =
                        distanceMm

                    nearestIndex =
                        slotIndex
                }
            }

            if (
                nearestIndex <
                    0 ||
                nearestDistanceMm >
                    matchDistanceLimitMm
            ) {
                unmatchedDetectionCount++

                gatedDetections.add(
                    YoloGatedDetection(
                        detection =
                            detection,
                        accepted =
                            false,
                        centerErrorMm =
                            if (
                                nearestDistanceMm.isFinite()
                            ) {
                                nearestDistanceMm
                            } else {
                                null
                            },
                        rejectionReason =
                            "outside_bubble_grid",
                    )
                )

                continue
            }

            if (
                nearestIndex in
                matchedSlotIndices
            ) {
                duplicateRejectedCount++

                val duplicateSlot =
                    expectedSlots[
                        nearestIndex
                    ]

                gatedDetections.add(
                    YoloGatedDetection(
                        detection =
                            detection,
                        accepted =
                            false,
                        question =
                            duplicateSlot.question,
                        choice =
                            duplicateSlot.choice,
                        centerErrorMm =
                            nearestDistanceMm,
                        rejectionReason =
                            "duplicate_slot_lower_confidence",
                    )
                )

                continue
            }

            matchedSlotIndices.add(
                nearestIndex
            )

            val slot =
                expectedSlots[
                    nearestIndex
                ]

            gatedDetections.add(
                YoloGatedDetection(
                    detection =
                        detection,
                    accepted =
                        true,
                    question =
                        slot.question,
                    choice =
                        slot.choice,
                    centerErrorMm =
                        nearestDistanceMm,
                )
            )

            matchRows.add(
                mapOf(
                    "question" to
                        slot.question,
                    "choice" to
                        slot.choice,
                    "confidence" to
                        detection.confidence.toDouble(),
                    "centerErrorMm" to
                        nearestDistanceMm,
                    "expectedCenter" to
                        mapOf(
                            "x" to
                                slot.center.x,
                            "y" to
                                slot.center.y,
                        ),
                    "detectedCenter" to
                        mapOf(
                            "x" to
                                detection.centerX,
                            "y" to
                                detection.centerY,
                        ),
                    "box" to
                        mapOf(
                            "x1" to
                                detection.x1,
                            "y1" to
                                detection.y1,
                            "x2" to
                                detection.x2,
                            "y2" to
                                detection.y2,
                            "width" to
                                detection.width,
                            "height" to
                                detection.height,
                        ),
                )
            )
        }

        val errorValues =
            matchRows.map {
                row ->
                row[
                    "centerErrorMm"
                ] as Double
            }

        val meanCenterErrorMm =
            if (
                errorValues.isEmpty()
            ) {
                0.0
            } else {
                errorValues.average()
            }

        val medianCenterErrorMm =
            if (
                errorValues.isEmpty()
            ) {
                0.0
            } else {
                median(
                    errorValues
                )
            }

        val maxCenterErrorMm =
            errorValues.maxOrNull()
                ?: 0.0

        val missingSlots =
            expectedSlots
                .mapIndexedNotNull {
                    slotIndex,
                    slot ->

                    if (
                        slotIndex in
                        matchedSlotIndices
                    ) {
                        null
                    } else {
                        mapOf<String, Any>(
                            "question" to
                                slot.question,
                            "choice" to
                                slot.choice,
                            "expectedCenter" to
                                mapOf(
                                    "x" to
                                        slot.center.x,
                                    "y" to
                                        slot.center.y,
                                ),
                        )
                    }
                }

        val sortedForSample =
            matchRows.sortedWith(
                compareBy<Map<String, Any>> {
                    row ->
                    row[
                        "question"
                    ] as Int
                }.thenBy {
                    row ->
                    row[
                        "choice"
                    ] as String
                }
            )

        val worstMatches =
            matchRows
                .sortedByDescending {
                    row ->
                    row[
                        "centerErrorMm"
                    ] as Double
                }
                .take(
                    20
                )

        val matchedExpectedCount =
            matchedSlotIndices.size

        val expectedBubbleCount =
            expectedSlots.size

        return YoloMappingResult(
            expectedBubbleCount =
                expectedBubbleCount,
            matchedExpectedCount =
                matchedExpectedCount,
            missingExpectedCount =
                expectedBubbleCount -
                    matchedExpectedCount,
            unmatchedDetectionCount =
                unmatchedDetectionCount,
            duplicateRejectedCount =
                duplicateRejectedCount,
            matchedRatio =
                if (
                    expectedBubbleCount ==
                        0
                ) {
                    0.0
                } else {
                    matchedExpectedCount.toDouble() /
                        expectedBubbleCount.toDouble()
                },
            matchDistanceLimitMm =
                matchDistanceLimitMm,
            meanCenterErrorMm =
                meanCenterErrorMm,
            medianCenterErrorMm =
                medianCenterErrorMm,
            maxCenterErrorMm =
                maxCenterErrorMm,
            matches =
                sortedForSample,
            sampleMatches =
                sortedForSample.take(
                    15
                ),
            worstMatches =
                worstMatches,
            missingSlots =
                missingSlots.take(
                    50
                ),
            gatedDetections =
                gatedDetections,
        )
    }

    private fun buildExpectedBubbleSlots(
        questionCount: Int,
    ): List<ExpectedBubbleSlot> {
        val slots =
            ArrayList<ExpectedBubbleSlot>(
                questionCount *
                    5
            )

        for (
            question in
            1..questionCount
        ) {
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
                    when (
                        questionCount
                    ) {
                        QUESTION_COUNT_50 ->
                            getBubbleCenter50(
                                question =
                                    question,
                                choiceIndex =
                                    choiceIndex,
                            )

                        QUESTION_COUNT_100 ->
                            getBubbleCenter100(
                                question =
                                    question,
                                choiceIndex =
                                    choiceIndex,
                            )

                        else ->
                            throw IllegalArgumentException(
                                "Unsupported YOLO slot question count: $questionCount"
                            )
                    }

                slots.add(
                    ExpectedBubbleSlot(
                        question =
                            question,
                        choice =
                            choice,
                        center =
                            center,
                    )
                )
            }
        }

        return slots
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

        var corePixels =
            0

        var coreMarkedPixels =
            0

        val sectorPixels =
            IntArray(4)

        val sectorMarkedPixels =
            IntArray(4)

        val gridPixels =
            IntArray(9)

        val gridMarkedPixels =
            IntArray(9)

        val radialPixels =
            IntArray(3)

        val radialMarkedPixels =
            IntArray(3)

        var interiorMarkedPixels =
            0

        var interiorMarkedDxSum =
            0.0

        var interiorMarkedDySum =
            0.0

        val interiorLuminanceValues =
            mutableListOf<Double>()

        val interiorRelativeDarknessValues =
            mutableListOf<Double>()

        var interiorProfilePixels =
            0

        var interiorWeakMarkedPixels =
            0

        var interiorNormalMarkedPixels =
            0

        var interiorStrongMarkedPixels =
            0

        var interiorVeryStrongMarkedPixels =
            0

        var outlineBandPixels =
            0

        var outlineBandNormalMarkedPixels =
            0

        /*
        |--------------------------------------------------------------------------
        | Bubble Analysis Disk + Interior Fill Geometry
        |--------------------------------------------------------------------------
        |
        | Whole-disk coverage remains the legacy density signal. In parallel we
        | measure the center and four interior quadrants. The printed bubble ring
        | lives near the edge of the analysis disk, so interior geometry gives a
        | much cleaner signal for full-vs-partial fill completeness.
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

                    val isMarked =
                        pixel[0] <=
                            darkThreshold

                    if (
                        isMarked
                    ) {

                        markedPixels++
                    }

                    if (
                        radiusMm <=
                            FILL_INTERIOR_RADIUS_MM
                    ) {

                        interiorProfilePixels++

                        val luminance =
                            pixel[0]

                        val relativeDarkness =
                            (
                                (
                                    backgroundMedian -
                                        luminance
                                    ) /
                                    255.0
                                ).coerceIn(
                                    0.0,
                                    1.0
                                )

                        interiorLuminanceValues.add(
                            luminance
                        )

                        interiorRelativeDarknessValues.add(
                            relativeDarkness
                        )

                        if (
                            relativeDarkness >=
                                MARK_PROFILE_WEAK_DARKNESS_EXCESS
                        ) {
                            interiorWeakMarkedPixels++
                        }

                        if (
                            relativeDarkness >=
                                MARK_PROFILE_NORMAL_DARKNESS_EXCESS
                        ) {
                            interiorNormalMarkedPixels++
                        }

                        if (
                            relativeDarkness >=
                                MARK_PROFILE_STRONG_DARKNESS_EXCESS
                        ) {
                            interiorStrongMarkedPixels++
                        }

                        if (
                            relativeDarkness >=
                                MARK_PROFILE_VERY_STRONG_DARKNESS_EXCESS
                        ) {
                            interiorVeryStrongMarkedPixels++
                        }
                    } else {

                        outlineBandPixels++

                        if (
                            pixel[0] <=
                                darkThreshold
                        ) {
                            outlineBandNormalMarkedPixels++
                        }
                    }

                    if (
                        radiusMm <=
                            FILL_CORE_RADIUS_MM
                    ) {

                        corePixels++

                        if (
                            isMarked
                        ) {
                            coreMarkedPixels++
                        }
                    }

                    if (
                        radiusMm <=
                            FILL_INTERIOR_RADIUS_MM
                    ) {

                        val gridBandWidthMm =
                            (
                                FILL_GRID_RADIUS_MM *
                                    2.0
                                ) /
                                3.0

                        val gridColumn =
                            (
                                (
                                    (
                                        dxMm +
                                            FILL_GRID_RADIUS_MM
                                        ) /
                                        gridBandWidthMm
                                    ).toInt()
                                ).coerceIn(
                                    0,
                                    2
                                )

                        val gridRow =
                            (
                                (
                                    (
                                        dyMm +
                                            FILL_GRID_RADIUS_MM
                                        ) /
                                        gridBandWidthMm
                                    ).toInt()
                                ).coerceIn(
                                    0,
                                    2
                                )

                        val gridIndex =
                            gridRow *
                                3 +
                                gridColumn

                        gridPixels[
                            gridIndex
                        ]++

                        if (
                            isMarked
                        ) {
                            gridMarkedPixels[
                                gridIndex
                            ]++
                        }

                        val radialIndex =
                            when {
                                radiusMm <=
                                    FILL_RADIAL_INNER_RADIUS_MM -> 0

                                radiusMm <=
                                    FILL_RADIAL_MIDDLE_RADIUS_MM -> 1

                                else -> 2
                            }

                        radialPixels[
                            radialIndex
                        ]++

                        if (
                            isMarked
                        ) {
                            radialMarkedPixels[
                                radialIndex
                            ]++
                        }

                        val sectorIndex =
                            when {
                                dxMm < 0.0 &&
                                    dyMm < 0.0 -> 0

                                dxMm >= 0.0 &&
                                    dyMm < 0.0 -> 1

                                dxMm < 0.0 &&
                                    dyMm >= 0.0 -> 2

                                else -> 3
                            }

                        sectorPixels[
                            sectorIndex
                        ]++

                        if (
                            isMarked
                        ) {

                            sectorMarkedPixels[
                                sectorIndex
                            ]++

                            interiorMarkedPixels++

                            interiorMarkedDxSum +=
                                dxMm

                            interiorMarkedDySum +=
                                dyMm
                        }
                    }
                }
            }
        }

        val backgroundMean =
            backgroundValues.average()

        val backgroundStdDev =
            if (
                backgroundValues.size > 1
            ) {
                sqrt(
                    backgroundValues.sumOf {
                        value ->

                        val delta =
                            value -
                                backgroundMean

                        delta *
                            delta
                    } /
                        backgroundValues.size.toDouble()
                )
            } else {
                0.0
            }

        val backgroundP10 =
            percentile(
                backgroundValues,
                0.10
            )

        val backgroundP90 =
            percentile(
                backgroundValues,
                0.90
            )

        val backgroundRobustSpread =
            backgroundP90 -
                backgroundP10

        val interiorMeanLuminance =
            if (
                interiorLuminanceValues.isNotEmpty()
            ) {
                interiorLuminanceValues.average()
            } else {
                backgroundMedian
            }

        val interiorMedianLuminance =
            if (
                interiorLuminanceValues.isNotEmpty()
            ) {
                median(
                    interiorLuminanceValues
                )
            } else {
                backgroundMedian
            }

        val interiorRelativeDarknessMean =
            if (
                interiorRelativeDarknessValues.isNotEmpty()
            ) {
                interiorRelativeDarknessValues.average()
            } else {
                0.0
            }

        val interiorRelativeDarknessMedian =
            if (
                interiorRelativeDarknessValues.isNotEmpty()
            ) {
                median(
                    interiorRelativeDarknessValues
                )
            } else {
                0.0
            }

        fun profileCoverage(
            markedPixels: Int
        ): Double {
            return if (
                interiorProfilePixels > 0
            ) {
                markedPixels.toDouble() /
                    interiorProfilePixels.toDouble()
            } else {
                0.0
            }
        }

        val interiorCoverageWeak =
            profileCoverage(
                interiorWeakMarkedPixels
            )

        val interiorCoverageNormal =
            profileCoverage(
                interiorNormalMarkedPixels
            )

        val interiorCoverageStrong =
            profileCoverage(
                interiorStrongMarkedPixels
            )

        val interiorCoverageVeryStrong =
            profileCoverage(
                interiorVeryStrongMarkedPixels
            )

        val strongToNormalPersistence =
            if (
                interiorCoverageNormal > 0.0
            ) {
                (
                    interiorCoverageStrong /
                        interiorCoverageNormal
                    ).coerceIn(
                        0.0,
                        1.0
                    )
            } else {
                0.0
            }

        val veryStrongToNormalPersistence =
            if (
                interiorCoverageNormal > 0.0
            ) {
                (
                    interiorCoverageVeryStrong /
                        interiorCoverageNormal
                    ).coerceIn(
                        0.0,
                        1.0
                    )
            } else {
                0.0
            }

        val outlineBandCoverageNormal =
            if (
                outlineBandPixels > 0
            ) {
                outlineBandNormalMarkedPixels.toDouble() /
                    outlineBandPixels.toDouble()
            } else {
                0.0
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

        val coreCoverage =
            if (
                corePixels > 0
            ) {
                coreMarkedPixels.toDouble() /
                    corePixels.toDouble()
            } else {
                0.0
            }

        val sectorCoverages =
            (0 until 4).map {
                sectorIndex ->

                if (
                    sectorPixels[
                        sectorIndex
                    ] > 0
                ) {
                    sectorMarkedPixels[
                        sectorIndex
                    ].toDouble() /
                        sectorPixels[
                            sectorIndex
                        ].toDouble()
                } else {
                    0.0
                }
            }

        val minSectorCoverage =
            sectorCoverages.minOrNull()
                ?: 0.0

        val maxSectorCoverage =
            sectorCoverages.maxOrNull()
                ?: 0.0

        val sectorSpread =
            maxSectorCoverage -
                minSectorCoverage

        val grid3x3Coverages =
            (0 until 9).map {
                gridIndex ->

                if (
                    gridPixels[
                        gridIndex
                    ] > 0
                ) {
                    gridMarkedPixels[
                        gridIndex
                    ].toDouble() /
                        gridPixels[
                            gridIndex
                        ].toDouble()
                } else {
                    0.0
                }
            }

        val minGridCoverage =
            grid3x3Coverages.minOrNull()
                ?: 0.0

        val maxGridCoverage =
            grid3x3Coverages.maxOrNull()
                ?: 0.0

        val gridSpread =
            maxGridCoverage -
                minGridCoverage

        val radialCoverages =
            (0 until 3).map {
                radialIndex ->

                if (
                    radialPixels[
                        radialIndex
                    ] > 0
                ) {
                    radialMarkedPixels[
                        radialIndex
                    ].toDouble() /
                        radialPixels[
                            radialIndex
                        ].toDouble()
                } else {
                    0.0
                }
            }

        val minRadialCoverage =
            radialCoverages.minOrNull()
                ?: 0.0

        val maxRadialCoverage =
            radialCoverages.maxOrNull()
                ?: 0.0

        val radialSpread =
            maxRadialCoverage -
                minRadialCoverage

        val markCentroidOffsetRatio =
            if (
                interiorMarkedPixels > 0
            ) {

                val centroidDxMm =
                    interiorMarkedDxSum /
                        interiorMarkedPixels.toDouble()

                val centroidDyMm =
                    interiorMarkedDySum /
                        interiorMarkedPixels.toDouble()

                (
                    sqrt(
                        centroidDxMm * centroidDxMm +
                            centroidDyMm * centroidDyMm
                    ) /
                        FILL_INTERIOR_RADIUS_MM
                    ).coerceIn(
                        0.0,
                        1.0
                    )

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
                backgroundValues.size,

            backgroundMean =
                backgroundMean,

            backgroundStdDev =
                backgroundStdDev,

            backgroundP10 =
                backgroundP10,

            backgroundP90 =
                backgroundP90,

            backgroundRobustSpread =
                backgroundRobustSpread,

            interiorMeanLuminance =
                interiorMeanLuminance,

            interiorMedianLuminance =
                interiorMedianLuminance,

            interiorRelativeDarknessMean =
                interiorRelativeDarknessMean,

            interiorRelativeDarknessMedian =
                interiorRelativeDarknessMedian,

            interiorCoverageWeak =
                interiorCoverageWeak,

            interiorCoverageNormal =
                interiorCoverageNormal,

            interiorCoverageStrong =
                interiorCoverageStrong,

            interiorCoverageVeryStrong =
                interiorCoverageVeryStrong,

            strongToNormalPersistence =
                strongToNormalPersistence,

            veryStrongToNormalPersistence =
                veryStrongToNormalPersistence,

            outlineBandCoverageNormal =
                outlineBandCoverageNormal,

            coreCoverage =
                coreCoverage,

            sectorCoverages =
                sectorCoverages,

            minSectorCoverage =
                minSectorCoverage,

            maxSectorCoverage =
                maxSectorCoverage,

            sectorSpread =
                sectorSpread,

            grid3x3Coverages =
                grid3x3Coverages,

            minGridCoverage =
                minGridCoverage,

            maxGridCoverage =
                maxGridCoverage,

            gridSpread =
                gridSpread,

            radialCoverages =
                radialCoverages,

            minRadialCoverage =
                minRadialCoverage,

            maxRadialCoverage =
                maxRadialCoverage,

            radialSpread =
                radialSpread,

            markCentroidOffsetRatio =
                markCentroidOffsetRatio
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
    | Percentile
    |--------------------------------------------------------------------------
    */

    private fun percentile(
        values: List<Double>,
        percentile: Double
    ): Double {

        if (values.isEmpty()) {

            throw IllegalArgumentException(
                "Cannot calculate percentile of empty values."
            )
        }

        val sorted =
            values.sorted()

        if (
            sorted.size ==
                1
        ) {
            return sorted[0]
        }

        val clamped =
            percentile.coerceIn(
                0.0,
                1.0
            )

        val position =
            clamped *
                (
                    sorted.size -
                        1
                    ).toDouble()

        val lowerIndex =
            floor(
                position
            ).toInt()

        val upperIndex =
            ceil(
                position
            ).toInt()

        if (
            lowerIndex ==
                upperIndex
        ) {
            return sorted[
                lowerIndex
            ]
        }

        val fraction =
            position -
                lowerIndex.toDouble()

        return sorted[
            lowerIndex
        ] +
            (
                sorted[
                    upperIndex
                ] -
                    sorted[
                        lowerIndex
                    ]
                ) *
                fraction
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

            val initialized =
                OpenCVLoader.initLocal()

            if (!initialized) {

                throw IllegalStateException(
                    "OpenCV native library initialization failed."
                )
            }

            openCvInitialized =
                true

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