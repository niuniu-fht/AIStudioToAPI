<template>
    <section class="panel">
        <div class="panel-toolbar">
            <div>
                <h2>本地图片</h2>
                <p>这里展示由 inlineData 落盘生成的图片文件，可预览、复制 URL 或批量删除。</p>
            </div>
            <div class="toolbar-actions">
                <el-button @click="loadImages">刷新</el-button>
                <el-button type="danger" :disabled="selectedImages.length === 0" @click="deleteSelected">
                    批量删除
                </el-button>
            </div>
        </div>

        <el-table
            v-loading="loading"
            :data="images"
            border
            class="image-table"
            @selection-change="selectedImages = $event"
        >
            <el-table-column type="selection" width="48" />
            <el-table-column label="预览" width="116">
                <template #default="{ row }">
                    <button class="thumb-button" type="button" @click="previewImage(row)">
                        <img :src="row.url" :alt="row.filename" />
                    </button>
                </template>
            </el-table-column>
            <el-table-column label="文件名" min-width="260" prop="filename" />
            <el-table-column label="大小" width="110">
                <template #default="{ row }">{{ formatSize(row.size) }}</template>
            </el-table-column>
            <el-table-column label="更新时间" width="190">
                <template #default="{ row }">{{ formatDate(row.modifiedAt) }}</template>
            </el-table-column>
            <el-table-column fixed="right" label="操作" width="190">
                <template #default="{ row }">
                    <el-button link type="primary" @click="copyUrl(row)">复制 URL</el-button>
                    <el-button link type="danger" @click="deleteImages([row])">删除</el-button>
                </template>
            </el-table-column>
        </el-table>

        <el-empty v-if="!loading && images.length === 0" description="暂无本地图片" />

        <el-dialog v-model="previewVisible" class="image-preview-dialog" :title="preview?.filename || '图片预览'">
            <img v-if="preview" class="preview-image" :src="preview.url" :alt="preview.filename" />
            <template #footer>
                <el-button v-if="preview" @click="copyUrl(preview)">复制 URL</el-button>
                <el-button @click="previewVisible = false">关闭</el-button>
            </template>
        </el-dialog>
    </section>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";

const images = ref([]);
const selectedImages = ref([]);
const loading = ref(false);
const preview = ref(null);
const previewVisible = ref(false);

const requestJson = async (url, options = {}) => {
    const response = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || data.message || "请求失败");
    }
    return data;
};

const loadImages = async () => {
    loading.value = true;
    try {
        const data = await requestJson("/api/generated-images");
        images.value = data.images || [];
    } catch (error) {
        ElMessage.error(`加载失败：${error.message}`);
    } finally {
        loading.value = false;
    }
};

const formatSize = size => {
    if (!Number.isFinite(size)) return "-";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

const formatDate = value => {
    if (!value) return "-";
    return new Date(value).toLocaleString();
};

const previewImage = image => {
    preview.value = image;
    previewVisible.value = true;
};

const copyUrl = async image => {
    const absoluteUrl = new URL(image.url, window.location.origin).toString();
    await navigator.clipboard.writeText(absoluteUrl);
    ElMessage.success("URL 已复制");
};

const deleteImages = async rows => {
    if (!rows.length) return;
    await ElMessageBox.confirm(`确定删除 ${rows.length} 张图片？此操作不可恢复。`, "确认删除", { type: "warning" });
    const data = await requestJson("/api/generated-images", {
        body: JSON.stringify({ filenames: rows.map(row => row.filename) }),
        method: "DELETE",
    });
    if (data.failed?.length) {
        ElMessage.warning(`已删除 ${data.deleted.length} 张，失败 ${data.failed.length} 张`);
    } else {
        ElMessage.success(`已删除 ${data.deleted.length} 张图片`);
    }
    await loadImages();
};

const deleteSelected = async () => {
    try {
        await deleteImages(selectedImages.value);
    } catch (error) {
        if (error !== "cancel") {
            ElMessage.error(`删除失败：${error.message || error}`);
        }
    }
};

onMounted(loadImages);
</script>

<style scoped lang="less">
.panel-toolbar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;

    h2 {
        margin: 0 0 6px;
        font-size: 20px;
    }

    p {
        margin: 0;
        color: #667085;
    }
}

.toolbar-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
}

.thumb-button {
    width: 82px;
    height: 62px;
    padding: 0;
    overflow: hidden;
    border: 1px solid #dcdfe6;
    border-radius: 6px;
    background: #f5f7fa;
    cursor: pointer;

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }
}

.image-table {
    width: 100%;
}

.preview-image {
    display: block;
    max-width: 100%;
    max-height: 70vh;
    margin: 0 auto;
    border-radius: 8px;
}

@media (max-width: 768px) {
    .panel-toolbar {
        flex-direction: column;
    }

    .toolbar-actions {
        width: 100%;
        justify-content: flex-start;
    }
}
</style>
