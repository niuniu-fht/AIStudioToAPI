/**
 * File: src/routes/ManagementRoutes.js
 * Description: Management APIs for model mappings and generated image files.
 */

class ManagementRoutes {
    constructor(serverSystem) {
        this.serverSystem = serverSystem;
        this.logger = serverSystem.logger;
    }

    setupRoutes(app, isAuthenticated) {
        app.get("/tools", isAuthenticated, (req, res) => {
            res.sendFile(this.serverSystem.distIndexPath);
        });

        app.get("/api/model-mappings", isAuthenticated, (req, res) => {
            res.json({
                mappings: this.serverSystem.modelMappingService.list(),
            });
        });

        app.put("/api/model-mappings", isAuthenticated, (req, res) => {
            try {
                const mapping = this.serverSystem.modelMappingService.upsert(req.body || {});
                res.json({ mapping, message: "modelMappingSaved" });
            } catch (error) {
                res.status(400).json({ error: error.message, message: "modelMappingSaveFailed" });
            }
        });

        app.delete("/api/model-mappings/:id", isAuthenticated, (req, res) => {
            const removed = this.serverSystem.modelMappingService.remove(req.params.id);
            if (!removed) {
                return res.status(404).json({ message: "modelMappingNotFound" });
            }
            return res.json({ message: "modelMappingDeleted" });
        });

        app.post("/api/model-mappings/reset-defaults", isAuthenticated, (req, res) => {
            res.json({
                mappings: this.serverSystem.modelMappingService.resetDefaults(),
                message: "modelMappingDefaultsRestored",
            });
        });

        app.get("/api/size-mappings", isAuthenticated, (req, res) => {
            res.json({
                mappings: this.serverSystem.sizeMappingService.list(),
            });
        });

        app.put("/api/size-mappings", isAuthenticated, (req, res) => {
            try {
                const mapping = this.serverSystem.sizeMappingService.upsert(req.body || {});
                res.json({ mapping, message: "sizeMappingSaved" });
            } catch (error) {
                res.status(400).json({ error: error.message, message: "sizeMappingSaveFailed" });
            }
        });

        app.delete("/api/size-mappings/:id", isAuthenticated, (req, res) => {
            const removed = this.serverSystem.sizeMappingService.remove(req.params.id);
            if (!removed) {
                return res.status(404).json({ message: "sizeMappingNotFound" });
            }
            return res.json({ message: "sizeMappingDeleted" });
        });

        app.post("/api/size-mappings/reset-defaults", isAuthenticated, (req, res) => {
            res.json({
                mappings: this.serverSystem.sizeMappingService.resetDefaults(),
                message: "sizeMappingDefaultsRestored",
            });
        });

        app.get("/api/generated-images", isAuthenticated, (req, res) => {
            try {
                res.json({
                    images: this.serverSystem.generatedImageService.list(),
                });
            } catch (error) {
                res.status(500).json({ error: error.message, message: "generatedImagesListFailed" });
            }
        });

        app.delete("/api/generated-images", isAuthenticated, (req, res) => {
            try {
                const result = this.serverSystem.generatedImageService.remove(req.body?.filenames || []);
                res.json({
                    ...result,
                    message: result.failed.length > 0 ? "generatedImagesDeletePartial" : "generatedImagesDeleted",
                });
            } catch (error) {
                res.status(400).json({ error: error.message, message: "generatedImagesDeleteFailed" });
            }
        });
    }
}

module.exports = ManagementRoutes;
