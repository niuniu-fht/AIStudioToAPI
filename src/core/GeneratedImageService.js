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
                const stat = fs.statSync(filePath);

                return {
                    createdAt: stat.birthtime.toISOString(),
                    filename: entry.name,
                    modifiedAt: stat.mtime.toISOString(),
                    size: stat.size,
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
                result.deleted.push(safeName);
            } catch (error) {
                result.failed.push({ error: error.message, filename });
            }
        });

        return result;
    }

    _ensureDir() {
        fs.mkdirSync(this.imageDir, { recursive: true });
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
