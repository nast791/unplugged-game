import arrowButton from '~/ui/arrow-button.js';
import avatar from '~/ui/avatar.js';
import button from '~/ui/button.js';
import checkbox from '~/ui/checkbox.js';
import checkboxGroup from '~/ui/checkbox-group.js';
import dropdown from '~/ui/dropdown.js';
import hintsWindow from '~/ui/hints-window.js';
import input from '~/ui/input.js';
import loader from '~/ui/loader.js';
import modal from '~/ui/modal.js';
import picture from '~/ui/picture.js';
import radio from '~/ui/radio.js';
import radioGroup from '~/ui/radio-group.js';
import scroll from '~/ui/scroll.js';
import select from '~/ui/select.js';
import switchPreset from '~/ui/switch.js';
import tabs from '~/ui/tabs.js';
import tooltip from '~/ui/tooltip.js';

export default defineAppConfig({
  ui: {
    arrowButton,
    avatar,
    button,
    checkbox,
    checkboxGroup,
    dropdown,
    hintsWindow,
    input,
    loader,
    modal,
    picture,
    radio,
    radioGroup,
    scroll,
    select,
    switch: switchPreset,
    tabs,
    tooltip,
  },
});
