<template>
    <section class="panel">
        <div class="panel-toolbar">
            <div>
                <h2>模型映射</h2>
                <p>请求进入后会先匹配源模型，命中后再转发到目标模型。</p>
            </div>
            <div class="toolbar-actions">
                <el-button @click="loadMappings">刷新</el-button>
                <el-button @click="resetDefaults">恢复默认图片映射</el-button>
                <el-button type="primary" @click="openEditor()">新增映射</el-button>
            </div>
        </div>

        <el-table v-loading="loading" :data="mappings" border class="mapping-table">
            <el-table-column label="启用" width="82">
                <template #default="{ row }">
                    <el-switch v-model="row.enabled" @change="saveMapping(row)" />
                </template>
            </el-table-column>
            <el-table-column label="源模型" min-width="260" prop="sourceModel" />
            <el-table-column label="目标模型" min-width="260" prop="targetModel" />
            <el-table-column label="类型" width="100">
                <template #default="{ row }">
                    <el-tag :type="row.isDefault ? 'info' : 'success'" effect="plain">
                        {{ row.isDefault ? "默认" : "自定义" }}
                    </el-tag>
                </template>
            </el-table-column>
            <el-table-column label="备注" min-width="180" prop="remark" />
            <el-table-column fixed="right" label="操作" width="160">
                <template #default="{ row }">
                    <el-button link type="primary" @click="openEditor(row)">编辑</el-button>
                    <el-button link type="danger" @click="deleteMapping(row)">删除</el-button>
                </template>
            </el-table-column>
        </el-table>

        <el-dialog v-model="editorVisible" :title="form.id ? '编辑映射' : '新增映射'" width="720px">
            <el-form label-position="top">
                <el-form-item label="源模型">
                    <el-input v-model="form.sourceModel" placeholder="gemini-3.1-flash-image:streamGenerateContent" />
                </el-form-item>
                <el-form-item label="目标模型">
                    <el-input v-model="form.targetModel" placeholder="gemini-3.1-flash-image:generateContent" />
                </el-form-item>
                <el-form-item label="备注">
                    <el-input v-model="form.remark" placeholder="这条规则的用途" />
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
    enabled: true,
    id: "",
    isDefault: false,
    remark: "",
    sourceModel: "",
    targetModel: "",
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
        const data = await requestJson("/api/model-mappings");
        mappings.value = data.mappings || [];
    } catch (error) {
        ElMessage.error(`加载失败：${error.message}`);
    } finally {
        loading.value = false;
    }
};

const openEditor = mapping => {
    Object.assign(form, {
        enabled: mapping?.enabled !== false,
        id: mapping?.id || "",
        isDefault: Boolean(mapping?.isDefault),
        remark: mapping?.remark || "",
        sourceModel: mapping?.sourceModel || "",
        targetModel: mapping?.targetModel || "",
    });
    editorVisible.value = true;
};

const saveMapping = async mapping => {
    try {
        await requestJson("/api/model-mappings", {
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
    if (!form.sourceModel.trim() || !form.targetModel.trim()) {
        ElMessage.warning("请填写源模型和目标模型");
        return;
    }
    await saveMapping({ ...form });
    editorVisible.value = false;
};

const deleteMapping = async mapping => {
    try {
        await ElMessageBox.confirm(`删除映射 ${mapping.sourceModel}？`, "确认删除", { type: "warning" });
        await requestJson(`/api/model-mappings/${mapping.id}`, { method: "DELETE" });
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
        await requestJson("/api/model-mappings/reset-defaults", { method: "POST" });
        ElMessage.success("默认图片映射已恢复");
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

.mapping-table {
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
