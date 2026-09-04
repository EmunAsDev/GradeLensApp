package com.gradelens.omr

import org.opencv.core.Mat
import org.opencv.core.Rect
import org.opencv.core.Size
import org.opencv.imgproc.CLAHE
import org.opencv.imgproc.Imgproc

import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

class CrossAnalyzer {

    companion object {

        /*
        |--------------------------------------------------------------------------
        | Canonical GradeLens Sheet
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
        | Cross Calibration
        |--------------------------------------------------------------------------
        |
        | Shared by both the 50- and 100-item sheets. This geometry was
        | validated on the 50-item layout and intentionally reused as-is
        | for 100-item, per GradeLensOmrModule's parity checkpoint notes.
        |--------------------------------------------------------------------------
        */

        private const val CONTEXT_SIZE_MM =
            6.5

        private const val INNER_RADIUS_MM =
            1.95

        private const val OUTER_RADIUS_MM =
            3.05

        private const val DIAGONAL_BAND_MM =
            0.28

        private const val CENTER_OFFSET_MM =
            0.30

        const val POSSIBLE_CROSS_THRESHOLD =
            0.040

        const val DEFINITE_CROSS_THRESHOLD =
            0.080

        private val MAIN_ANGLES =
            doubleArrayOf(
                30.0,
                35.0,
                40.0,
                45.0,
                50.0,
                55.0,
                60.0,
            )

        private val ANTI_ANGLES =
            doubleArrayOf(
                120.0,
                125.0,
                130.0,
                135.0,
                140.0,
                145.0,
                150.0,
            )

        private val CENTER_OFFSETS_MM =
            arrayOf(
                doubleArrayOf(
                    -CENTER_OFFSET_MM,
                    -CENTER_OFFSET_MM,
                ),

                doubleArrayOf(
                    0.0,
                    -CENTER_OFFSET_MM,
                ),

                doubleArrayOf(
                    CENTER_OFFSET_MM,
                    -CENTER_OFFSET_MM,
                ),

                doubleArrayOf(
                    -CENTER_OFFSET_MM,
                    0.0,
                ),

                doubleArrayOf(
                    0.0,
                    0.0,
                ),

                doubleArrayOf(
                    CENTER_OFFSET_MM,
                    0.0,
                ),

                doubleArrayOf(
                    -CENTER_OFFSET_MM,
                    CENTER_OFFSET_MM,
                ),

                doubleArrayOf(
                    0.0,
                    CENTER_OFFSET_MM,
                ),

                doubleArrayOf(
                    CENTER_OFFSET_MM,
                    CENTER_OFFSET_MM,
                ),
            )
    }

    data class Result(
        val mainArmScore: Double,

        val antiArmScore: Double,

        val strongerArmScore: Double,

        val weakerArmScore: Double,

        val crossScore: Double,

        val diagonalBalance: Double,

        val backgroundDarkness: Double,

        val bestMainAngle: Double,

        val bestAntiAngle: Double,

        val bestCenterOffsetX: Double,

        val bestCenterOffsetY: Double,

        val crossState: String,

        val predictedCross: Boolean,

        val needsReview: Boolean,
    )

    private data class CandidateResult(
        val mainArmScore: Double,

        val antiArmScore: Double,

        val strongerArmScore: Double,

        val weakerArmScore: Double,

        val diagonalBalance: Double,

        val bestMainAngle: Double,

        val bestAntiAngle: Double,

        val offsetX: Double,

        val offsetY: Double,
    )


    private data class AngleMask(
        val angle: Double,
        val indices: IntArray,
    )

    private data class OffsetGeometry(
        val offsetMmX: Double,
        val offsetMmY: Double,
        val mainMasks: List<AngleMask>,
        val antiMasks: List<AngleMask>,
    )

    private data class GeometryCache(
        val rows: Int,
        val cols: Int,
        val annulusIndices: IntArray,
        val backgroundIndices: IntArray,
        val offsets: List<OffsetGeometry>,
    )

    data class TimingSnapshot(
        val analyzeCount: Int,
        val totalAnalyzeNs: Long,
        val contextCropNs: Long,
        val darknessTotalNs: Long,
        val grayscaleNs: Long,
        val claheNs: Long,
        val gaussianBlurNs: Long,
        val darknessConvertNs: Long,
        val darknessBulkReadNs: Long,
        val geometryBuildNs: Long,
        val backgroundScanNs: Long,
        val angleSearchNs: Long,
        val mainAngleSearchNs: Long,
        val antiAngleSearchNs: Long,
        val candidateSelectionNs: Long,
    ) {

        private fun ms(
            value: Long,
        ): Double =
            value /
                1_000_000.0

        fun asMilliseconds():
            Map<String, Any> =
            mapOf(
                "analyzeCount" to analyzeCount,
                "totalAnalyze" to ms(totalAnalyzeNs),
                "contextCrop" to ms(contextCropNs),
                "darknessTotal" to ms(darknessTotalNs),
                "grayscale" to ms(grayscaleNs),
                "clahe" to ms(claheNs),
                "gaussianBlur" to ms(gaussianBlurNs),
                "darknessConvert" to ms(darknessConvertNs),
                "darknessBulkRead" to ms(darknessBulkReadNs),
                "geometryBuild" to ms(geometryBuildNs),
                "backgroundScan" to ms(backgroundScanNs),
                "angleSearch" to ms(angleSearchNs),
                "mainAngleSearch" to ms(mainAngleSearchNs),
                "antiAngleSearch" to ms(antiAngleSearchNs),
                "candidateSelection" to ms(candidateSelectionNs),
            )
    }

    private var timingAnalyzeCount = 0
    private var timingTotalAnalyzeNs = 0L
    private var timingContextCropNs = 0L
    private var timingDarknessTotalNs = 0L
    private var timingGrayscaleNs = 0L
    private var timingClaheNs = 0L
    private var timingGaussianBlurNs = 0L
    private var timingDarknessConvertNs = 0L
    private var timingDarknessBulkReadNs = 0L
    private var timingGeometryBuildNs = 0L
    private var timingBackgroundScanNs = 0L
    private var timingAngleSearchNs = 0L
    private var timingMainAngleSearchNs = 0L
    private var timingAntiAngleSearchNs = 0L
    private var timingCandidateSelectionNs = 0L

    private var geometryCache:
        GeometryCache? =
        null

    fun timingSnapshot():
        TimingSnapshot =
        TimingSnapshot(
            analyzeCount = timingAnalyzeCount,
            totalAnalyzeNs = timingTotalAnalyzeNs,
            contextCropNs = timingContextCropNs,
            darknessTotalNs = timingDarknessTotalNs,
            grayscaleNs = timingGrayscaleNs,
            claheNs = timingClaheNs,
            gaussianBlurNs = timingGaussianBlurNs,
            darknessConvertNs = timingDarknessConvertNs,
            darknessBulkReadNs = timingDarknessBulkReadNs,
            geometryBuildNs = timingGeometryBuildNs,
            backgroundScanNs = timingBackgroundScanNs,
            angleSearchNs = timingAngleSearchNs,
            mainAngleSearchNs = timingMainAngleSearchNs,
            antiAngleSearchNs = timingAntiAngleSearchNs,
            candidateSelectionNs = timingCandidateSelectionNs,
        )

    /*
    |--------------------------------------------------------------------------
    | Analyze Bubble
    |--------------------------------------------------------------------------
    */

    fun analyze(
        normalizedImage: Mat,
        centerX: Double,
        centerY: Double,
    ): Result {

        val analyzeStartNs =
            android.os.SystemClock.elapsedRealtimeNanos()

        if (
            normalizedImage.empty()
        ) {
            throw IllegalArgumentException(
                "Normalized image is empty.",
            )
        }

        val pxPerMmX =
            NORMALIZED_WIDTH.toDouble() /
                SHEET_WIDTH_MM

        val pxPerMmY =
            NORMALIZED_HEIGHT.toDouble() /
                SHEET_HEIGHT_MM

        val pxPerMm =
            (
                pxPerMmX +
                    pxPerMmY
            ) /
                2.0

        val contextSize =
            (
                CONTEXT_SIZE_MM *
                    pxPerMm
            )
                .toInt()
                .coerceAtLeast(
                    3,
                )
                .let {
                    if (
                        it % 2 == 0
                    ) {
                        it + 1
                    } else {
                        it
                    }
                }

        val cropStartNs =
            android.os.SystemClock.elapsedRealtimeNanos()

        val crop =
            getContextCrop(
                normalizedImage,
                centerX,
                centerY,
                contextSize,
            )

        timingContextCropNs +=
            android.os.SystemClock.elapsedRealtimeNanos() -
                cropStartNs

        try {

            return analyzeCrop(
                crop,
                pxPerMm,
            )

        } finally {

            crop.release()

            timingAnalyzeCount++

            timingTotalAnalyzeNs +=
                android.os.SystemClock.elapsedRealtimeNanos() -
                    analyzeStartNs
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Context Crop
    |--------------------------------------------------------------------------
    */

    private fun getContextCrop(
        image: Mat,
        centerX: Double,
        centerY: Double,
        size: Int,
    ): Mat {

        val half =
            size /
                2

        val cx =
            centerX
                .toInt()

        val cy =
            centerY
                .toInt()

        val x =
            cx -
                half

        val y =
            cy -
                half

        if (
            x < 0 ||
            y < 0 ||
            x + size >
            image.cols() ||
            y + size >
            image.rows()
        ) {
            throw IllegalArgumentException(
                "Cross context crop is outside normalized image.",
            )
        }

        return Mat(
            image,
            Rect(
                x,
                y,
                size,
                size,
            ),
        ).clone()
    }

    /*
    |--------------------------------------------------------------------------
    | Analyze Context Crop
    |--------------------------------------------------------------------------
    */

    private fun analyzeCrop(
        crop: Mat,
        pxPerMm: Double,
    ): Result {

        val darknessStartNs =
            android.os.SystemClock.elapsedRealtimeNanos()

        val darkness =
            createDarknessImage(
                crop,
            )

        timingDarknessTotalNs +=
            android.os.SystemClock.elapsedRealtimeNanos() -
                darknessStartNs

        try {

            val rows =
                darkness.rows()

            val cols =
                darkness.cols()

            val geometry =
                getOrCreateGeometry(
                    rows =
                        rows,

                    cols =
                        cols,

                    pxPerMm =
                        pxPerMm,
                )

            val darknessValues =
                DoubleArray(
                    rows *
                        cols
                )

            val darknessReadStartNs =
                android.os.SystemClock.elapsedRealtimeNanos()

            val copiedValues =
                darkness.get(
                    0,
                    0,
                    darknessValues,
                )

            timingDarknessBulkReadNs +=
                android.os.SystemClock.elapsedRealtimeNanos() -
                    darknessReadStartNs

            /*
             * OpenCV Mat.get(..., DoubleArray) returns the number of BYTES copied,
             * not the number of Double elements.
             *
             * CV_64F uses 8 bytes per value.
             */
            val expectedBytes =
                darknessValues.size *
                    java.lang.Double.BYTES

            if (
                copiedValues !=
                    expectedBytes
            ) {
                throw IllegalStateException(
                    "Could not read complete cross darkness buffer. " +
                        "Expected $expectedBytes bytes for ${darknessValues.size} values, " +
                        "received $copiedValues bytes.",
                )
            }

            val backgroundStartNs =
                android.os.SystemClock.elapsedRealtimeNanos()

            var backgroundSum =
                0.0

            for (
                index in
                geometry.backgroundIndices
            ) {
                backgroundSum +=
                    darknessValues[
                        index
                    ]
            }

            var fullAnnulusSum =
                0.0

            for (
                index in
                geometry.annulusIndices
            ) {
                fullAnnulusSum +=
                    darknessValues[
                        index
                    ]
            }

            val backgroundDarkness =
                if (
                    geometry.backgroundIndices.size >=
                        20
                ) {

                    backgroundSum /
                        geometry.backgroundIndices.size

                } else {

                    if (
                        geometry.annulusIndices.isEmpty()
                    ) {
                        0.0
                    } else {
                        fullAnnulusSum /
                            geometry.annulusIndices.size
                    }
                }

            timingBackgroundScanNs +=
                android.os.SystemClock.elapsedRealtimeNanos() -
                    backgroundStartNs

            val angleSearchStartNs =
                android.os.SystemClock.elapsedRealtimeNanos()

            var bestResult:
                CandidateResult? =
                null

            for (
                offset in
                geometry.offsets
            ) {

                val mainStartNs =
                    android.os.SystemClock.elapsedRealtimeNanos()

                val mainResult =
                    bestAngleScore(
                        darknessValues =
                            darknessValues,

                        masks =
                            offset.mainMasks,

                        backgroundDarkness =
                            backgroundDarkness,
                    )

                timingMainAngleSearchNs +=
                    android.os.SystemClock.elapsedRealtimeNanos() -
                        mainStartNs

                val antiStartNs =
                    android.os.SystemClock.elapsedRealtimeNanos()

                val antiResult =
                    bestAngleScore(
                        darknessValues =
                            darknessValues,

                        masks =
                            offset.antiMasks,

                        backgroundDarkness =
                            backgroundDarkness,
                    )

                timingAntiAngleSearchNs +=
                    android.os.SystemClock.elapsedRealtimeNanos() -
                        antiStartNs

                val candidateStartNs =
                    android.os.SystemClock.elapsedRealtimeNanos()

                val stronger =
                    max(
                        mainResult.second,
                        antiResult.second,
                    )

                val weaker =
                    min(
                        mainResult.second,
                        antiResult.second,
                    )

                val balance =
                    weaker /
                        max(
                            stronger,
                            1e-6,
                        )

                val candidate =
                    CandidateResult(
                        mainArmScore =
                            mainResult.second,

                        antiArmScore =
                            antiResult.second,

                        strongerArmScore =
                            stronger,

                        weakerArmScore =
                            weaker,

                        diagonalBalance =
                            balance,

                        bestMainAngle =
                            mainResult.first,

                        bestAntiAngle =
                            antiResult.first,

                        offsetX =
                            offset.offsetMmX,

                        offsetY =
                            offset.offsetMmY,
                    )

                if (
                    bestResult == null ||
                    isBetterCandidate(
                        candidate,
                        bestResult,
                    )
                ) {
                    bestResult =
                        candidate
                }

                timingCandidateSelectionNs +=
                    android.os.SystemClock.elapsedRealtimeNanos() -
                        candidateStartNs
            }

            timingAngleSearchNs +=
                android.os.SystemClock.elapsedRealtimeNanos() -
                    angleSearchStartNs

            val finalCandidate =
                bestResult
                    ?: throw IllegalStateException(
                        "Cross detector produced no candidate.",
                    )

            val crossScore =
                finalCandidate
                    .weakerArmScore

            val crossState =
                when {

                    crossScore >=
                        DEFINITE_CROSS_THRESHOLD ->
                        "definite_cross"

                    crossScore >=
                        POSSIBLE_CROSS_THRESHOLD ->
                        "possible_cross"

                    else ->
                        "not_crossed"
                }

            return Result(
                mainArmScore =
                    finalCandidate
                        .mainArmScore,

                antiArmScore =
                    finalCandidate
                        .antiArmScore,

                strongerArmScore =
                    finalCandidate
                        .strongerArmScore,

                weakerArmScore =
                    finalCandidate
                        .weakerArmScore,

                crossScore =
                    crossScore,

                diagonalBalance =
                    finalCandidate
                        .diagonalBalance,

                backgroundDarkness =
                    backgroundDarkness,

                bestMainAngle =
                    finalCandidate
                        .bestMainAngle,

                bestAntiAngle =
                    finalCandidate
                        .bestAntiAngle,

                bestCenterOffsetX =
                    finalCandidate
                        .offsetX,

                bestCenterOffsetY =
                    finalCandidate
                        .offsetY,

                crossState =
                    crossState,

                predictedCross =
                    crossState ==
                        "definite_cross",

                needsReview =
                    crossState ==
                        "possible_cross",
            )

        } finally {

            darkness.release()
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Cached Geometry
    |--------------------------------------------------------------------------
    |
    | The geometry is identical for every bubble in one normalized sheet.
    | Build all annulus/background/angle pixel-index masks once, then reuse.
    |--------------------------------------------------------------------------
    */

    private fun getOrCreateGeometry(
        rows: Int,
        cols: Int,
        pxPerMm: Double,
    ): GeometryCache {

        val existing =
            geometryCache

        if (
            existing !=
                null &&
            existing.rows ==
                rows &&
            existing.cols ==
                cols
        ) {
            return existing
        }

        val buildStartNs =
            android.os.SystemClock.elapsedRealtimeNanos()

        val center =
            (
                cols -
                    1
            ) /
                2.0

        val innerRadius =
            INNER_RADIUS_MM *
                pxPerMm

        val outerRadius =
            OUTER_RADIUS_MM *
                pxPerMm

        val diagonalBand =
            DIAGONAL_BAND_MM *
                pxPerMm

        val annulus =
            ArrayList<Int>()

        val excludedFromBackground =
            BooleanArray(
                rows *
                    cols
            )

        val offsetGeometries =
            ArrayList<OffsetGeometry>(
                CENTER_OFFSETS_MM.size
            )

        for (
            offsetMm in
            CENTER_OFFSETS_MM
        ) {

            val offsetX =
                offsetMm[0] *
                    pxPerMm

            val offsetY =
                offsetMm[1] *
                    pxPerMm

            val mainMasks =
                ArrayList<AngleMask>(
                    MAIN_ANGLES.size
                )

            for (
                angle in
                MAIN_ANGLES
            ) {

                val indices =
                    buildAngleIndices(
                        rows =
                            rows,

                        cols =
                            cols,

                        center =
                            center,

                        innerRadius =
                            innerRadius,

                        outerRadius =
                            outerRadius,

                        band =
                            diagonalBand,

                        angle =
                            angle,

                        offsetX =
                            offsetX,

                        offsetY =
                            offsetY,
                    )

                for (
                    index in
                    indices
                ) {
                    excludedFromBackground[
                        index
                    ] =
                        true
                }

                mainMasks.add(
                    AngleMask(
                        angle =
                            angle,

                        indices =
                            indices,
                    )
                )
            }

            val antiMasks =
                ArrayList<AngleMask>(
                    ANTI_ANGLES.size
                )

            for (
                angle in
                ANTI_ANGLES
            ) {

                val indices =
                    buildAngleIndices(
                        rows =
                            rows,

                        cols =
                            cols,

                        center =
                            center,

                        innerRadius =
                            innerRadius,

                        outerRadius =
                            outerRadius,

                        band =
                            diagonalBand,

                        angle =
                            angle,

                        offsetX =
                            offsetX,

                        offsetY =
                            offsetY,
                    )

                for (
                    index in
                    indices
                ) {
                    excludedFromBackground[
                        index
                    ] =
                        true
                }

                antiMasks.add(
                    AngleMask(
                        angle =
                            angle,

                        indices =
                            indices,
                    )
                )
            }

            offsetGeometries.add(
                OffsetGeometry(
                    offsetMmX =
                        offsetMm[0],

                    offsetMmY =
                        offsetMm[1],

                    mainMasks =
                        mainMasks,

                    antiMasks =
                        antiMasks,
                )
            )
        }

        for (
            y in
            0 until rows
        ) {

            for (
                x in
                0 until cols
            ) {

                val dx =
                    x.toDouble() -
                        center

                val dy =
                    y.toDouble() -
                        center

                val radius =
                    sqrt(
                        dx * dx +
                            dy * dy,
                    )

                if (
                    radius >=
                        innerRadius &&
                    radius <=
                        outerRadius
                ) {
                    annulus.add(
                        y *
                            cols +
                            x
                    )
                }
            }
        }

        val background =
            ArrayList<Int>()

        for (
            index in
            annulus
        ) {

            if (
                !excludedFromBackground[
                    index
                ]
            ) {
                background.add(
                    index
                )
            }
        }

        val built =
            GeometryCache(
                rows =
                    rows,

                cols =
                    cols,

                annulusIndices =
                    annulus
                        .toIntArray(),

                backgroundIndices =
                    background
                        .toIntArray(),

                offsets =
                    offsetGeometries,
            )

        geometryCache =
            built

        timingGeometryBuildNs +=
            android.os.SystemClock.elapsedRealtimeNanos() -
                buildStartNs

        return built
    }

    private fun buildAngleIndices(
        rows: Int,
        cols: Int,
        center: Double,
        innerRadius: Double,
        outerRadius: Double,
        band: Double,
        angle: Double,
        offsetX: Double,
        offsetY: Double,
    ): IntArray {

        val values =
            ArrayList<Int>()

        val theta =
            Math.toRadians(
                angle,
            )

        val sinTheta =
            sin(
                theta,
            )

        val cosTheta =
            cos(
                theta,
            )

        for (
            y in
            0 until rows
        ) {

            for (
                x in
                0 until cols
            ) {

                val dx =
                    x.toDouble() -
                        center

                val dy =
                    y.toDouble() -
                        center

                val radius =
                    sqrt(
                        dx * dx +
                            dy * dy,
                    )

                if (
                    radius <
                        innerRadius ||
                    radius >
                        outerRadius
                ) {
                    continue
                }

                val shiftedDx =
                    dx -
                        offsetX

                val shiftedDy =
                    dy -
                        offsetY

                val distance =
                    abs(
                        -sinTheta *
                            shiftedDx +
                            cosTheta *
                                shiftedDy,
                    )

                if (
                    distance <=
                        band
                ) {
                    values.add(
                        y *
                            cols +
                            x
                    )
                }
            }
        }

        return values
            .toIntArray()
    }

    /*
    |--------------------------------------------------------------------------
    | Python Candidate Selection Parity
    |--------------------------------------------------------------------------
    |
    | Primary:
    | weaker arm
    |
    | Secondary:
    | stronger arm
    |
    | Tertiary:
    | diagonal balance
    |
    |--------------------------------------------------------------------------
    */

    private fun isBetterCandidate(
        candidate: CandidateResult,
        current: CandidateResult,
    ): Boolean {

        if (
            candidate.weakerArmScore >
            current.weakerArmScore
        ) {
            return true
        }

        if (
            candidate.weakerArmScore <
            current.weakerArmScore
        ) {
            return false
        }

        if (
            candidate.strongerArmScore >
            current.strongerArmScore
        ) {
            return true
        }

        if (
            candidate.strongerArmScore <
            current.strongerArmScore
        ) {
            return false
        }

        return (
            candidate.diagonalBalance >
                current.diagonalBalance
            )
    }

    /*
    |--------------------------------------------------------------------------
    | Best Score For Angle Family
    |--------------------------------------------------------------------------
    */

    private fun bestAngleScore(
        darknessValues: DoubleArray,
        masks: List<AngleMask>,
        backgroundDarkness: Double,
    ): Pair<Double, Double> {

        if (
            masks.isEmpty()
        ) {
            throw IllegalArgumentException(
                "Angle mask list cannot be empty.",
            )
        }

        var bestAngle =
            masks[0]
                .angle

        var bestScore =
            0.0

        for (
            mask in
            masks
        ) {

            var darknessSum =
                0.0

            for (
                index in
                mask.indices
            ) {
                darknessSum +=
                    darknessValues[
                        index
                    ]
            }

            val lineDarkness =
                if (
                    mask.indices.isEmpty()
                ) {

                    0.0

                } else {

                    darknessSum /
                        mask.indices.size
                }

            val score =
                max(
                    0.0,
                    lineDarkness -
                        backgroundDarkness,
                )

            if (
                score >
                    bestScore
            ) {

                bestScore =
                    score

                bestAngle =
                    mask.angle
            }
        }

        return Pair(
            bestAngle,
            bestScore,
        )
    }

    /*
    |--------------------------------------------------------------------------
    | Diagonal Line Mask
    |--------------------------------------------------------------------------
    */

    private fun isInsideLineBand(
        dx: Double,
        dy: Double,
        angleDegrees: Double,
        band: Double,
        offsetX: Double,
        offsetY: Double,
    ): Boolean {

        val shiftedDx =
            dx -
                offsetX

        val shiftedDy =
            dy -
                offsetY

        val theta =
            Math.toRadians(
                angleDegrees,
            )

        val distance =
            abs(
                -sin(
                    theta,
                ) *
                    shiftedDx +
                    cos(
                        theta,
                    ) *
                    shiftedDy,
            )

        return (
            distance <=
                band
            )
    }

    /*
    |--------------------------------------------------------------------------
    | CLAHE + Blur + Darkness
    |--------------------------------------------------------------------------
    */

    private fun createDarknessImage(
        crop: Mat,
    ): Mat {

        val gray =
            Mat()

        val enhanced =
            Mat()

        val blurred =
            Mat()

        val darkness =
            Mat()

        var clahe:
            CLAHE? =
            null

        try {

            val grayscaleStartNs =
                android.os.SystemClock.elapsedRealtimeNanos()

            if (
                crop.channels() ==
                1
            ) {

                crop.copyTo(
                    gray,
                )

            } else {

                Imgproc.cvtColor(
                    crop,
                    gray,
                    Imgproc.COLOR_BGR2GRAY,
                )
            }

            timingGrayscaleNs +=
                android.os.SystemClock.elapsedRealtimeNanos() -
                    grayscaleStartNs

            clahe =
                Imgproc.createCLAHE(
                    2.0,
                    Size(
                        4.0,
                        4.0,
                    ),
                )

            val claheStartNs =
                android.os.SystemClock.elapsedRealtimeNanos()

            clahe.apply(
                gray,
                enhanced,
            )

            timingClaheNs +=
                android.os.SystemClock.elapsedRealtimeNanos() -
                    claheStartNs

            val gaussianStartNs =
                android.os.SystemClock.elapsedRealtimeNanos()

            Imgproc.GaussianBlur(
                enhanced,
                blurred,
                Size(
                    3.0,
                    3.0,
                ),
                0.0,
            )

            timingGaussianBlurNs +=
                android.os.SystemClock.elapsedRealtimeNanos() -
                    gaussianStartNs

            /*
             * Convert:
             *
             * darkness = (255 - gray) / 255
             *
             * CV_64F keeps the scores directly
             * comparable to Python's 0..1 representation.
             */

            val darknessConvertStartNs =
                android.os.SystemClock.elapsedRealtimeNanos()

            blurred.convertTo(
                darkness,
                org.opencv.core.CvType.CV_64F,
                -1.0 /
                    255.0,
                1.0,
            )

            timingDarknessConvertNs +=
                android.os.SystemClock.elapsedRealtimeNanos() -
                    darknessConvertStartNs

            return darkness

        } finally {

            gray.release()

            enhanced.release()

            blurred.release()

            clahe?.collectGarbage()
        }
    }
}