/**
 * File: src/core/GeneratedImageService.js
 * Description: Lists and removes locally stored generated images.
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_IMAGE_DIR = path.join(process.cwd(), "data", "generated-images");
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bin"]);

class GeneratedImageService {
    constructor(logger) {
        this.logger = logger;
        this.imageDir = process.env.GENERATED_IMAGE_DIR || DEFAULT_IMAGE_DIR;
    }

    list() {
        this._ensureDir();

        return fs
            .readdirSync(this.imageDir, { withFileTypes: true })
            .filter(entry => entry.isFile() && ALLOWED_IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
            .map(entry => {
                const filePath = path.join(this.imageDir, entry.name);
                const metadata = this.readMetadata(entry.name);
                const stat = fs.statSync(filePath);

                return {
                    aspectRatio: metadata?.size?.aspectRatio || null,
                    createdAt: stat.birthtime.toISOString(),
                    filename: entry.name,
                    metadata,
                    model: metadata?.model?.target || metadata?.model?.requested || null,
                    modifiedAt: stat.mtime.toISOString(),
                    openaiSize: metadata?.size?.openaiSize || null,
                    promptPreview: metadata?.request?.promptPreview || null,
                    requestId: metadata?.requestId || null,
                    size: stat.size,
                    source: metadata?.source || null,
                    url: `/generated-images/${encodeURIComponent(entry.name)}`,
                };
            })
            .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
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
