<template>
  <div class="profiles h-100 flex flex-column flex-nowrap panel">
    <div class="head flex flex-nowrap">
      <h3>SSH 连接配置</h3>
      <span class="flex-1"></span>
      <el-button type="primary" @click="openEdit()">新建配置</el-button>
      <el-button @click="load">刷新</el-button>
    </div>
    <div class="body flex-1 scrollbar">
      <el-table :data="list" size="default" height="100%">
        <el-table-column prop="name" label="名称" min-width="140">
          <template #default="{ row }">
            <span class="ellipsis">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="主机" min-width="180">
          <template #default="{ row }">
            <span class="mono">{{ row.username }}@{{ row.host }}:{{ row.port }}</span>
          </template>
        </el-table-column>
        <el-table-column label="认证" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.auth === 'key' ? 'warning' : 'info'">
              {{ row.auth === 'key' ? '私钥' : '密码' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" text type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="show" :title="form.id ? '编辑配置' : '新建配置'" width="560px" destroy-on-close>
      <el-form :model="form" label-width="8rem">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="显示名称" />
        </el-form-item>
        <el-form-item label="主机" required>
          <el-input v-model="form.host" placeholder="IP 或域名" />
        </el-form-item>
        <el-form-item label="端口" required>
          <el-input-number v-model="form.port" :min="1" :max="65535" />
        </el-form-item>
        <el-form-item label="用户名" required>
          <el-input v-model="form.username" />
        </el-form-item>
        <el-form-item label="认证方式">
          <el-radio-group v-model="form.auth">
            <el-radio value="password">密码</el-radio>
            <el-radio value="key">私钥</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.auth === 'password'" label="密码">
          <el-input v-model="form.password" type="password" show-password />
        </el-form-item>
        <template v-else>
          <el-form-item label="私钥">
            <el-input v-model="form.privateKey" type="textarea" :rows="6" placeholder="OpenSSH 私钥全文" />
          </el-form-item>
          <el-form-item label="密钥口令">
            <el-input v-model="form.passphrase" type="password" show-password />
          </el-form-item>
        </template>
        <el-form-item label="备注">
          <el-input v-model="form.remark" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="show = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { deleteProfile, fetchProfiles, saveProfile } from '@/api/api';

const list = ref([]);
const show = ref(false);
const saving = ref(false);

const empty = () => ({
  id: '',
  name: '',
  host: '',
  port: 22,
  username: 'root',
  password: '',
  privateKey: '',
  passphrase: '',
  auth: 'password',
  remark: '',
});

const form = reactive(empty());

const load = async () => {
  try {
    list.value = (await fetchProfiles()) || [];
  } catch (e) {
    ElMessage.error(e.message || '加载失败');
  }
};

const openEdit = (row) => {
  Object.assign(form, empty(), row || {});
  show.value = true;
};

const save = async () => {
  if (!form.name || !form.host || !form.username) {
    ElMessage.warning('请填写名称、主机、用户名');
    return;
  }
  saving.value = true;
  try {
    await saveProfile({ ...form });
    ElMessage.success('已保存');
    show.value = false;
    await load();
  } catch (e) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
};

const remove = async (row) => {
  try {
    await ElMessageBox.confirm(`确认删除配置「${row.name}」？`, '提示', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
    await deleteProfile(row.id);
    ElMessage.success('已删除');
    await load();
  } catch {
    /* cancel */
  }
};

onMounted(load);
</script>

<style scoped>
.profiles {
  border-radius: var(--radius-xl);
  overflow: hidden;
}
.head {
  padding: 1.2rem 1.4rem;
  border-bottom: 1px solid var(--main-border-color);
  align-items: center;
  gap: 0.6rem;
}
.head h3 {
  font-size: 1.5rem;
  font-weight: 600;
}
.body {
  min-height: 0;
  padding: 0.4rem;
}
</style>
