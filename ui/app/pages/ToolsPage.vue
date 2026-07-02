<template>
    <div class="tools-page">
        <header class="tools-header">
            <div>
                <p class="eyebrow">Operations</p>
                <h1>工具管理</h1>
                <p class="subtitle">配置上游模型名转换，并管理本地缓存的生成图片。</p>
            </div>
            <el-button @click="goHome">返回状态页</el-button>
        </header>

        <el-tabs v-model="activeTab" class="tools-tabs">
            <el-tab-pane label="模型映射" name="mappings">
                <ModelMappingsPanel />
            </el-tab-pane>
            <el-tab-pane label="图片管理" name="images">
                <GeneratedImagesPanel />
            </el-tab-pane>
        </el-tabs>
    </div>
</template>

<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import GeneratedImagesPanel from "../components/GeneratedImagesPanel.vue";
import ModelMappingsPanel from "../components/ModelMappingsPanel.vue";

const router = useRouter();
const activeTab = ref("mappings");

const goHome = () => {
    router.push({ name: "status" });
};
</script>

<style scoped lang="less">
.tools-page {
    min-height: 100vh;
    padding: 32px;
    background: linear-gradient(180deg, rgba(28, 108, 167, 0.06), rgba(28, 108, 167, 0)), var(--bg-color, #f7f8fa);
}

.tools-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    max-width: 1180px;
    margin: 0 auto 20px;

    h1 {
        margin: 4px 0 8px;
        font-size: 28px;
        line-height: 1.2;
        color: var(--text-primary, #1f2937);
    }
}

.eyebrow {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-primary, #409eff);
}

.subtitle {
    margin: 0;
    color: var(--text-secondary, #667085);
}

.tools-tabs {
    max-width: 1180px;
    margin: 0 auto;
    padding: 20px;
    border: 1px solid var(--border-light, #e5e7eb);
    border-radius: 8px;
    background: var(--bg-white, #fff);
}

@media (max-width: 768px) {
    .tools-page {
        padding: 18px;
    }

    .tools-header {
        flex-direction: column;
    }
}
</style>
