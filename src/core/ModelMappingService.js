/**
 * File: src/core/ModelMappingService.js
 * Description: Persistent model mapping rules for normalizing upstream model operation names.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const MAPPINGS_FILE = path.join(DATA_DIR, "model-mappings.json");
const GENERATION_OPERATION_PATTERN = /(generateContent|streamGenerateContent)$/;

class ModelMappingService {
    constructor(logger, config) {
        this.logger = logger;
        this.config = config;
        this.filePath = process.env.MODEL_MAPPINGS_FILE || MAPPINGS_FILE;
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
        const existingSources = new Set(merged.map(item => item.sourceModel));
        defaults.forEach(item => {
            if (!existingSources.has(item.sourceModel)) {
                merged.push(item);
            }
        });

        this.mappings = merged.map(item => this._normalizeMapping(item)).filter(Boolean);
        return this.mappings;
    }

    list() {
        return [...this.mappings].sort((a, b) => {
            if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
            return a.sourceModel.localeCompare(b.sourceModel);
        });
    }

    upsert(input) {
        const mapping = this._normalizeMapping({
            ...input,
            id: input.id || this._createId(input.sourceModel, input.targetModel),
            isDefault: Boolean(input.isDefault),
        });

        if (!mapping) {
            throw new Error("sourceModel and targetModel are required");
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

    resolveModelOperation(modelOperation) {
        const normalized = this._normalizeModelOperation(modelOperation);
        const mapping = this.mappings.find(item => item.enabled !== false && item.sourceModel === normalized);

        if (!mapping) {
            return {
                changed: false,
                modelOperation: normalized,
                sourceModel: normalized,
                targetModel: normalized,
            };
        }

        return {
            changed: true,
            modelOperation: mapping.targetModel,
            sourceModel: normalized,
            targetModel: mapping.targetModel,
        };
    }

    resolveGenerationPath(requestPath) {
        if (typeof requestPath !== "string") {
            return { changed: false, path: requestPath };
        }

        const match = requestPath.match(/^(\/(?:v1beta\/)?models\/)(.+):(generateContent|streamGenerateContent)(.*)$/);
        if (!match) {
            return { changed: false, path: requestPath };
        }

        const [, prefix, modelName, operation, suffix] = match;
        const resolved = this.resolveModelOperation(`${modelName}:${operation}`);
        if (!resolved.changed) {
            return { changed: false, path: requestPath };
        }

        const target = this._splitModelOperation(resolved.targetModel);
        if (!target.operation) {
            return {
                changed: true,
                path: `${prefix}${target.model}:${operation}${suffix}`,
                sourceModel: resolved.sourceModel,
                targetModel: resolved.targetModel,
            };
        }

        return {
            changed: true,
            path: `${prefix}${target.model}:${target.operation}${suffix}`,
            sourceModel: resolved.sourceModel,
            targetModel: resolved.targetModel,
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
            this.logger.warn(`[ModelMapping] Failed to read mappings file: ${error.message}`);
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
        const models = Array.isArray(this.config?.modelList) ? this.config.modelList : [];
        const imageModels = models
            .map(model =>
                String(model.name || "")
                    .replace(/^models\//, "")
                    .trim()
            )
            .filter(name => name && (name.includes("image") || name.includes("imagen")));

        return Array.from(new Set(imageModels)).map(modelName =>
            this._normalizeMapping({
                enabled: true,
                id: this._createId(`${modelName}:streamGenerateContent`, `${modelName}:generateContent`),
                isDefault: true,
                remark: "Image models do not use streaming generation.",
                sourceModel: `${modelName}:streamGenerateContent`,
                targetModel: `${modelName}:generateContent`,
            })
        );
    }

    _normalizeMapping(input) {
        if (!input || typeof input !== "object") return null;

        const sourceModel = this._normalizeModelOperation(input.sourceModel);
        const targetModel = this._normalizeModelOperation(input.targetModel);
        if (!sourceModel || !targetModel) return null;

        return {
            createdAt: input.createdAt || null,
            enabled: input.enabled !== false,
            id: input.id || this._createId(sourceModel, targetModel),
            isDefault: Boolean(input.isDefault),
            remark: String(input.remark || "").trim(),
            sourceModel,
            targetModel,
            updatedAt: input.updatedAt || null,
        };
    }

    _normalizeModelOperation(value) {
        return String(value || "")
            .trim()
            .replace(/^models\//, "")
            .replace(/^\/?v1beta\/models\//, "")
            .replace(/\?.*$/, "");
    }

    _splitModelOperation(value) {
        const normalized = this._normalizeModelOperation(value);
        const parts = normalized.split(":");
        const maybeOperation = parts[parts.length - 1];
        if (GENERATION_OPERATION_PATTERN.test(maybeOperation)) {
            return {
                model: parts.slice(0, -1).join(":"),
                operation: maybeOperation,
            };
        }

        return {
            model: normalized,
            operation: null,
        };
    }

    _createId(sourceModel, targetModel) {
        return crypto
            .createHash("sha1")
            .update(`${sourceModel || ""}->${targetModel || ""}`)
            .digest("hex")
            .slice(0, 12);
    }
}

module.exports = ModelMappingService;
