import { computed, reactive, ref, toValue, watch } from 'vue';

const activeModals = ref([]);
const modalPayloads = ref({});

export const getActiveModals = () => activeModals;

export const addActiveModal = key => {
  if (!key) return;
  if (!activeModals.value.includes(key)) activeModals.value = [...activeModals.value, key];
};

export const removeActiveModal = key => {
  if (!key) return;
  if (activeModals.value.includes(key)) {
    activeModals.value = activeModals.value.filter(item => item !== key);
  }
  if (key in modalPayloads.value) {
    const next = { ...modalPayloads.value };
    delete next[key];
    modalPayloads.value = next;
  }
};

export const openModal = (name, payload) => {
  if (!name) return;
  if (payload !== undefined) modalPayloads.value = { ...modalPayloads.value, [name]: payload };
  addActiveModal(name);
};

export const closeModal = name => removeActiveModal(name);

export const isModalOpen = name => (!name ? false : activeModals.value.includes(name));

export const toggleModal = (name, payload) => {
  if (!name) return;
  if (isModalOpen(name)) closeModal(name);
  else openModal(name, payload);
};

export const closeAllModals = () => {
  activeModals.value = [];
  modalPayloads.value = {};
};

export const isAnyModalOpen = () => computed(() => activeModals.value.length > 0);

export const getModalPayload = name => (name ? modalPayloads.value[name] : undefined);

export const useIsModalOpen = name =>
  computed(() => Boolean(toValue(name)) && activeModals.value.includes(toValue(name)));

export const useModalPayload = name =>
  computed(() => (name ? modalPayloads.value[toValue(name)] : undefined));

export const useModal = (nameOrInitial = false, initial = false) => {
  const isNamed = typeof nameOrInitial === 'string';
  const name = isNamed ? nameOrInitial : null;
  const init = isNamed ? initial : nameOrInitial;

  const open = ref(init);
  const syncing = ref(false);

  if (name) {
    if (init && !activeModals.value.includes(name)) addActiveModal(name);
    open.value = activeModals.value.includes(name) || Boolean(init);

    watch(
      () => activeModals.value.includes(name),
      shouldOpen => {
        if (open.value === shouldOpen) return;
        syncing.value = true;
        open.value = shouldOpen;
        syncing.value = false;
      },
    );

    if (import.meta.client) {
      watch(open, value => {
        if (syncing.value) return;
        const inList = activeModals.value.includes(name);
        if (value && !inList) addActiveModal(name);
        else if (!value && inList) removeActiveModal(name);
      });
    }
  }

  return reactive({
    open,
    isOpen: computed(() => (name ? activeModals.value.includes(name) : open.value)),
    payload: name ? useModalPayload(name) : undefined,
    openModal: payload => (name ? openModal(name, payload) : (open.value = true)),
    closeModal: () => (name ? closeModal(name) : (open.value = false)),
    toggle: payload => (name ? toggleModal(name, payload) : (open.value = !open.value)),
    closeAllModals,
  });
};

useModal.openModal = openModal;
useModal.closeModal = closeModal;
useModal.toggleModal = toggleModal;
useModal.closeAllModals = closeAllModals;
useModal.isModalOpen = isModalOpen;
useModal.isAnyModalOpen = isAnyModalOpen;
useModal.useIsModalOpen = useIsModalOpen;
useModal.getModalPayload = getModalPayload;
useModal.useModalPayload = useModalPayload;

export default useModal;
