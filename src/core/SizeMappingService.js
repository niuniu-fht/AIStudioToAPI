/**
 * File: src/core/SizeMappingService.js
 * Description: Persistent OpenAI image size mapping rules for Gemini imageConfig.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const SIZE_MAPPINGS_FILE = path.join(DATA_DIR, "size-mappings.json");

class SizeMappingService {
    constructor(logger) {
        this.logger = logger;
        this.filePath = process.env.SIZE_MAPPINGS_FILE || SIZE_MAPPINGS_FILE;
        this.mappings = [];
        this.load();
    }

    load() {
        const defaults = this._getDefaultMappings();
        const loaded = this._readMappingsFile();

        if (loaded.length === 0) {
            this.mappings = defaults;
            this.save();
            return this.mappings;
        }

        const merged = [...loaded];
        const existingSizes = new Set(merged.map(item => item.openaiSize));
        defaults.forEach(item => {
            if (!existingSizes.has(item.openaiSize)) {
                merged.push(item);
            }
        });

        this.mappings = merged.map(item => this._normalizeMapping(item)).filter(Boolean);
        return this.mappings;
    }

    list() {
        return [...this.mappings].sort((a, b) => {
            if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
            return a.openaiSize.localeCompare(b.openaiSize, undefined, { numeric: true });
        });
    }

    upsert(input) {
        const mapping = this._normalizeMapping({
            ...input,
            id: input.id || this._createId(input.openaiSize, input.aspectRatio, input.imageSize),
            isDefault: Boolean(input.isDefault),
        });

        if (!mapping) {
            throw new Error("openaiSize and aspectRatio are required");
        }

        const index = this.mappings.findIndex(item => item.id === mapping.id);
        if (index >= 0) {
            this.mappings.splice(index, 1, {
                ...this.mappings[index],
                ...mapping,
                updatedAt: new Date().toISOString(),
            });
        } else {
            this.mappings.push({
                ...mapping,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }

        this.save();
        return mapping;
    }

    remove(id) {
        const before = this.mappings.length;
        this.mappings = this.mappings.filter(item => item.id !== id);
        if (this.mappings.length === before) {
            return false;
        }
        this.save();
        return true;
    }

    resetDefaults() {
        const customMappings = this.mappings.filter(item => !item.isDefault);
        this.mappings = [...this._getDefaultMappings(), ...customMappings];
        this.save();
        return this.list();
    }

    resolve(size) {
        const openaiSize = this._normalizeSize(size);
        const mapping = this.mappings.find(item => item.enabled !== false && item.openaiSize === openaiSize);
        if (!mapping) {
            return {
                changed: false,
                openaiSize,
            };
        }

        return {
            aspectRatio: mapping.aspectRatio,
            changed: true,
            imageSize: mapping.imageSize || null,
            mapping,
            openaiSize,
        };
    }

    _readMappingsFile() {
        try {
            if (!fs.existsSync(this.filePath)) return [];
            const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
            const mappings = Array.isArray(parsed) ? parsed : parsed.mappings;
            if (!Array.isArray(mappings)) return [];
            return mappings.map(item => this._normalizeMapping(item)).filter(Boolean);
        } catch (error) {
            this.logger.warn(`[SizeMapping] Failed to read mappings file: ${error.message}`);
            return [];
        }
    }

    save() {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        fs.writeFileSync(
            this.filePath,
            JSON.stringify(
                {
                    mappings: this.mappings,
                    updatedAt: new Date().toISOString(),
                },
                null,
                2
            )
        );
    }

    _getDefaultMappings() {
        return [
            ["512x512", "1:1", ""],
            ["768x768", "1:1", ""],
            ["1024x1024", "1:1", ""],
            ["2048x2048", "1:1", "2K"],
            ["4096x4096", "1:1", "4K"],
            ["1344x768", "16:9", ""],
            ["1792x1024", "16:9", ""],
            ["1920x1080", "16:9", ""],
            ["3840x2160", "16:9", "4K"],
            ["768x1344", "9:16", ""],
            ["1024x1792", "9:16", ""],
            ["1080x1920", "9:16", ""],
            ["2160x3840", "9:16", "4K"],
            ["1152x864", "4:3", ""],
            ["1536x1024", "4:3", ""],
            ["1600x1200", "4:3", ""],
            ["864x1152", "3:4", ""],
            ["1024x1536", "3:4", ""],
            ["1200x1600", "3:4", ""],
        ].map(([openaiSize, aspectRatio, imageSize]) =>
            this._normalizeMapping({
                aspectRatio,
                enabled: true,
                id: this._createId(openaiSize, aspectRatio, imageSize),
                imageSize,
                isDefault: true,
                openaiSize,
                remark: "Default OpenAI image size mapping.",
            })
        );
    }

    _normalizeMapping(input) {
        if (!input || typeof input !== "object") return null;
        const openaiSize = this._normalizeSize(input.openaiSize);
        const aspectRatio = String(input.aspectRatio || "").trim();
        const imageSize = String(input.imageSize || "").trim();
        if (!openaiSize || !aspectRatio) return null;

        return {
            aspectRatio,
            createdAt: input.createdAt || null,
            enabled: input.enabled !== false,
            id: input.id || this._createId(openaiSize, aspectRatio, imageSize),
            imageSize,
            isDefault: Boolean(input.isDefault),
            openaiSize,
            remark: String(input.remark || "").trim(),
            updatedAt: input.updatedAt || null,
        };
    }

    _normalizeSize(size) {
        return String(size || "1024x1024")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "");
    }

    _createId(openaiSize, aspectRatio, imageSize) {
        return crypto
            .createHash("sha1")
            .update(`${openaiSize || ""}->${aspectRatio || ""}:${imageSize || ""}`)
            .digest("hex")
            .slice(0, 12);
    }
}

module.exports = SizeMappingService;
