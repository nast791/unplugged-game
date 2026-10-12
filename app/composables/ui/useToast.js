import { computed, ref } from 'vue';

const TOAST_MS = 2400;

const message = ref('');
let timer = null;

export const notify = (text, duration = TOAST_MS) => {
  message.value = String(text ?? '');
  clearTimeout(timer);
  timer = setTimeout(() => {
    message.value = '';
  }, duration);
};

export const clearToast = () => {
  clearTimeout(timer);
  message.value = '';
};

export const useToast = () => ({
  toast: computed(() => message.value),
  notify,
  clearToast,
});
