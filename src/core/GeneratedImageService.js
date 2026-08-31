/**
 * File: src/core/GeneratedImageService.js
 * Description: Lists and removes locally stored generated images.
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_IMAGE_DIR = path.join(process.cwd(), "data", "generated-images");
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bin"]);
const MB = 1024 * 1024;
const DEFAULT_CLEANUP_THRESHOLD_MB = 10000;
const DEFAULT_CLEANUP_TARGET_MB = 5000;
const DEFAULT_CLEANUP_MAX_COUNT = 500;
const DEFAULT_IMAGE_ROUTE = "/generated-images";

class GeneratedImageService {
    constructor(logger) {
        this.logger = logger;
        this.imageDir = process.env.GENERATED_IMAGE_DIR || DEFAULT_IMAGE_DIR;
        this.cleanupThresholdBytes = this._readMegabyteEnv(
            "GENERATED_IMAGE_CLEANUP_THRESHOLD_MB",
            DEFAULT_CLEANUP_THRESHOLD_MB
        );
        this.cleanupTargetBytes = this._readMegabyteEnv("GENERATED_IMAGE_CLEANUP_TARGET_MB", DEFAULT_CLEANUP_TARGET_MB);
        this.cleanupMaxCount = this._readIntegerEnv("GENERATED_IMAGE_CLEANUP_MAX_COUNT", DEFAULT_CLEANUP_MAX_COUNT);
    }

    list() {
        return this._listImageRecords().map(record => ({
            aspectRatio: record.metadata?.size?.aspectRatio || null,
            createdAt: record.stat.birthtime.toISOString(),
            filename: record.name,
            metadata: record.metadata,
            model: record.metadata?.model?.target || record.metadata?.model?.requested || null,
            modifiedAt: record.stat.mtime.toISOString(),
            openaiSize: record.metadata?.size?.openaiSize || null,
            promptPreview: record.metadata?.request?.promptPreview || null,
            requestId: record.metadata?.requestId || null,
            size: record.stat.size,
            source: record.metadata?.source || null,
            url: this._buildImageUrl(record.name),
        }));
    }

    stats() {
        const records = this._listImageRecords();
        const totalBytes = records.reduce((sum, record) => sum + record.stat.size, 0);

        return {
            cleanupMaxCount: this.cleanupMaxCount,
            cleanupTargetBytes: this.cleanupTargetBytes,
            cleanupTargetMb: Math.round(this.cleanupTargetBytes / MB),
            cleanupThresholdBytes: this.cleanupThresholdBytes,
            cleanupThresholdMb: Math.round(this.cleanupThresholdBytes / MB),
            count: records.length,
            totalBytes,
            totalMb: Math.round((totalBytes / MB) * 10) / 10,
        };
    }

    remove(filenames) {
        if (!Array.isArray(filenames) || filenames.length === 0) {
            throw new Error("filenames must be a non-empty array");
        }

        this._ensureDir();
        const result = {
            deleted: [],
            failed: [],
        };

        Array.from(new Set(filenames)).forEach(filename => {
            try {
                const safeName = this._sanitizeFilename(filename);
                const filePath = path.join(this.imageDir, safeName);
                if (!fs.existsSync(filePath)) {
                    result.failed.push({ error: "File not found", filename: safeName });
                    return;
                }
                fs.unlinkSync(filePath);
                const metadataPath = this._getMetadataPath(safeName);
                if (fs.existsSync(metadataPath)) {
                    fs.unlinkSync(metadataPath);
                }
                result.deleted.push(safeName);
            } catch (error) {
                result.failed.push({ error: error.message, filename });
            }
        });

        return result;
    }

    removeAll() {
        this._ensureDir();
        const filenames = this._listImageRecords().map(record => record.name);
        if (filenames.length === 0) {
            return { deleted: [], failed: [] };
        }
        return this.remove(filenames);
    }

    cleanupIfNeeded() {
        return this.cleanup({ force: false });
    }

    cleanup(options = {}) {
        this._ensureDir();
        const force = options.force === true;
        const records = this._listImageRecords();
        const totalBytes = records.reduce((sum, record) => sum + record.stat.size, 0);
        const overBytes = totalBytes > this.cleanupThresholdBytes;
        const overCount = this.cleanupMaxCount > 0 && records.length > this.cleanupMaxCount;

        const result = {
            deleted: [],
            failed: [],
            freedBytes: 0,
            maxCount: this.cleanupMaxCount,
            skipped: !force && !overBytes && !overCount,
            targetBytes: this.cleanupTargetBytes,
            thresholdBytes: this.cleanupThresholdBytes,
            totalBytesBefore: totalBytes,
            totalCountAfter: records.length,
            totalCountBefore: records.length,
        };

        if (result.skipped || records.length === 0) {
            result.totalBytesAfter = totalBytes;
            return result;
        }

        const oldestFirst = [...records].sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);
        for (const record of oldestFirst) {
            const stillOverBytes = force || totalBytes - result.freedBytes > this.cleanupThresholdBytes;
            const bytesTargetReached = result.freedBytes >= this.cleanupTargetBytes;
            const stillOverCount =
                this.cleanupMaxCount > 0 && records.length - result.deleted.length > this.cleanupMaxCount;
            if (!stillOverCount && (!stillOverBytes || bytesTargetReached)) break;

            try {
                fs.unlinkSync(record.path);
                const metadataPath = this._getMetadataPath(record.name);
                if (fs.existsSync(metadataPath)) {
                    fs.unlinkSync(metadataPath);
                }
                result.deleted.push(record.name);
                result.freedBytes += record.stat.size;
            } catch (error) {
                result.failed.push({ error: error.message, filename: record.name });
            }
        }

        result.totalBytesAfter = Math.max(0, totalBytes - result.freedBytes);
        result.totalCountAfter = Math.max(0, records.length - result.deleted.length);
        if (result.deleted.length > 0) {
            this.logger?.info(
                `[GeneratedImageService] Cleanup deleted ${result.deleted.length} images, freed ${Math.round(result.freedBytes / MB)} MB, count ${result.totalCountBefore} -> ${result.totalCountAfter}.`
            );
        }
        return result;
    }

    readMetadata(filename) {
        try {
            const metadataPath = this._getMetadataPath(filename);
            if (!fs.existsSync(metadataPath)) return null;
            return JSON.parse(fs.readFileSync(metadataPath, "utf8"));
        } catch (error) {
            this.logger?.warn(`[GeneratedImageService] Failed to read image metadata: ${error.message}`);
            return null;
        }
    }

    writeMetadata(filename, metadata) {
        this._ensureDir();
        const safeName = this._sanitizeFilename(filename);
        const metadataPath = this._getMetadataPath(safeName);
        fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 4)}\n`);
        return metadataPath;
    }

    _ensureDir() {
        fs.mkdirSync(this.imageDir, { recursive: true });
    }

    _listImageRecords() {
        this._ensureDir();

        return fs
            .readdirSync(this.imageDir, { withFileTypes: true })
            .filter(entry => entry.isFile() && ALLOWED_IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
            .map(entry => {
                const filePath = path.join(this.imageDir, entry.name);
                const stat = fs.statSync(filePath);
                return {
                    metadata: this.readMetadata(entry.name),
                    name: entry.name,
                    path: filePath,
                    stat,
                };
            })
            .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    }

    _readMegabyteEnv(name, defaultMb) {
        const value = Number.parseInt(process.env[name], 10);
        const mb = Number.isFinite(value) && value > 0 ? value : defaultMb;
        return mb * MB;
    }

    _readIntegerEnv(name, defaultValue) {
        const value = Number.parseInt(process.env[name], 10);
        return Number.isFinite(value) && value >= 0 ? value : defaultValue;
    }

    _buildImageUrl(filename) {
        const configuredBaseUrl = String(process.env.GENERATED_IMAGE_BASE_URL || "").replace(/\/+$/, "");
        const pathValue = `${DEFAULT_IMAGE_ROUTE}/${encodeURIComponent(filename)}`;
        return configuredBaseUrl ? `${configuredBaseUrl}${pathValue}` : pathValue;
    }

    _getMetadataPath(filename) {
        const safeName = this._sanitizeFilename(filename);
        return path.join(this.imageDir, `${safeName}.json`);
    }

    _sanitizeFilename(filename) {
        const safeName = path.basename(String(filename || ""));
        if (!safeName || safeName !== filename || safeName.includes("..")) {
            throw new Error("Invalid filename");
        }
        if (!ALLOWED_IMAGE_EXTENSIONS.has(path.extname(safeName).toLowerCase())) {
            throw new Error("Unsupported image extension");
        }
        return safeName;
    }
}

module.exports = GeneratedImageService;
