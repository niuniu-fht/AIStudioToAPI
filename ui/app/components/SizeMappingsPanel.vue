<template>
    <section class="panel">
        <div class="panel-toolbar">
            <div>
                <h2>尺寸映射</h2>
                <p>把 OpenAI Images 的 size 转换成 Gemini imageConfig，支持各类横竖屏比例。</p>
            </div>
            <div class="toolbar-actions">
                <el-button @click="loadMappings">刷新</el-button>
                <el-button @click="resetDefaults">恢复默认尺寸映射</el-button>
                <el-button type="primary" @click="openEditor()">新增尺寸</el-button>
            </div>
        </div>

        <el-table v-loading="loading" :data="mappings" border class="mapping-table">
            <el-table-column label="启用" width="82">
                <template #default="{ row }">
                    <el-switch v-model="row.enabled" @change="saveMapping(row)" />
                </template>
            </el-table-column>
            <el-table-column label="OpenAI size" min-width="160" prop="openaiSize" />
            <el-table-column label="Gemini 比例" width="140" prop="aspectRatio" />
            <el-table-column label="Gemini 尺寸" width="140">
                <template #default="{ row }">
                    {{ row.imageSize || "默认" }}
                </template>
            </el-table-column>
            <el-table-column label="类型" width="100">
                <template #default="{ row }">
                    <el-tag :type="row.isDefault ? 'info' : 'success'" effect="plain">
                        {{ row.isDefault ? "默认" : "自定义" }}
                    </el-tag>
                </template>
            </el-table-column>
            <el-table-column label="备注" min-width="190" prop="remark" />
            <el-table-column fixed="right" label="操作" width="160">
                <template #default="{ row }">
                    <el-button link type="primary" @click="openEditor(row)">编辑</el-button>
                    <el-button link type="danger" @click="deleteMapping(row)">删除</el-button>
                </template>
            </el-table-column>
        </el-table>

        <el-dialog v-model="editorVisible" :title="form.id ? '编辑尺寸映射' : '新增尺寸映射'" width="640px">
            <el-form label-position="top">
                <el-form-item label="OpenAI size">
                    <el-input v-model="form.openaiSize" placeholder="1792x1024" />
                </el-form-item>
                <el-form-item label="Gemini aspectRatio">
                    <el-select v-model="form.aspectRatio" placeholder="选择比例" class="full-control">
                        <el-option label="1:1" value="1:1" />
                        <el-option label="16:9" value="16:9" />
                        <el-option label="9:16" value="9:16" />
                        <el-option label="4:3" value="4:3" />
                        <el-option label="3:4" value="3:4" />
                    </el-select>
                </el-form-item>
                <el-form-item label="Gemini imageSize">
                    <el-select v-model="form.imageSize" placeholder="默认" clearable class="full-control">
                        <el-option label="默认" value="" />
                        <el-option label="1K" value="1K" />
                        <el-option label="2K" value="2K" />
                        <el-option label="4K" value="4K" />
                    </el-select>
                </el-form-item>
                <el-form-item label="备注">
                    <el-input v-model="form.remark" placeholder="这条尺寸规则的用途" />
                </el-form-item>
                <el-form-item>
                    <el-checkbox v-model="form.enabled">启用</el-checkbox>
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="editorVisible = false">取消</el-button>
                <el-button type="primary" @click="saveForm">保存</el-button>
            </template>
        </el-dialog>
    </section>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";

const mappings = ref([]);
const loading = ref(false);
const editorVisible = ref(false);
const form = reactive({
    aspectRatio: "1:1",
    enabled: true,
    id: "",
    imageSize: "",
    isDefault: false,
    openaiSize: "",
    remark: "",
});

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

const loadMappings = async () => {
    loading.value = true;
    try {
        const data = await requestJson("/api/size-mappings");
        mappings.value = data.mappings || [];
    } catch (error) {
        ElMessage.error(`加载失败：${error.message}`);
    } finally {
        loading.value = false;
    }
};

const openEditor = mapping => {
    Object.assign(form, {
        aspectRatio: mapping?.aspectRatio || "1:1",
        enabled: mapping?.enabled !== false,
        id: mapping?.id || "",
        imageSize: mapping?.imageSize || "",
        isDefault: Boolean(mapping?.isDefault),
        openaiSize: mapping?.openaiSize || "",
        remark: mapping?.remark || "",
    });
    editorVisible.value = true;
};

const saveMapping = async mapping => {
    try {
        await requestJson("/api/size-mappings", {
            body: JSON.stringify(mapping),
            method: "PUT",
        });
        ElMessage.success("已保存");
        await loadMappings();
    } catch (error) {
        ElMessage.error(`保存失败：${error.message}`);
        await loadMappings();
    }
};

const saveForm = async () => {
    if (!form.openaiSize.trim() || !form.aspectRatio.trim()) {
        ElMessage.warning("请填写 OpenAI size 和 Gemini 比例");
        return;
    }
    await saveMapping({ ...form });
    editorVisible.value = false;
};

const deleteMapping = async mapping => {
    try {
        await ElMessageBox.confirm(`删除尺寸映射 ${mapping.openaiSize}？`, "确认删除", { type: "warning" });
        await requestJson(`/api/size-mappings/${mapping.id}`, { method: "DELETE" });
        ElMessage.success("已删除");
        await loadMappings();
    } catch (error) {
        if (error !== "cancel") {
            ElMessage.error(`删除失败：${error.message || error}`);
        }
    }
};

const resetDefaults = async () => {
    try {
        await requestJson("/api/size-mappings/reset-defaults", { method: "POST" });
        ElMessage.success("默认尺寸映射已恢复");
        await loadMappings();
    } catch (error) {
        ElMessage.error(`恢复失败：${error.message}`);
    }
};

onMounted(loadMappings);
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

.mapping-table,
.full-control {
    width: 100%;
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
