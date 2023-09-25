import { VNode, Attrs } from 'snabbdom';
import { onInsert, lh as h, MaybeVNodes } from './snabbdom';
import { isTouchDevice, isIOS } from './mobile';
import * as xhr from './xhr';
import * as licon from './licon';

let dialogPolyfill: { registerDialog: (dialog: HTMLDialogElement) => void };

lichess.load.then(async () => {
  window.addEventListener('resize', onResize);
  if (!window.HTMLDialogElement)
    dialogPolyfill = (await import(lichess.assetUrl('npm/dialog-polyfill.esm.js'))).default;
});

export interface Dialog {
  readonly open: boolean; // is this dialog visible?
  readonly view: HTMLElement; // your content div
  readonly returnValue?: 'ok' | 'cancel' | string; // how did it close?

  showModal(): void;
  show(): void;
  close(): void;
}

interface DialogOpts {
  class?: string; // zero or more classes (period separated) for your view div
  cssPath?: string; // for themed css craplets
  cash?: Cash; // content, will be cloned and any 'none' class removed
  htmlUrl?: string; // content, url will be xhr'd
  htmlText?: string; // content, text will be used as-is
  attrs?: { dialog?: Attrs; view?: Attrs }; // optional attrs for dialog and view div
  onClose?: (dialog: Dialog) => void; // called when dialog closes
  noCloseButton?: boolean; // if true, no upper right corener close button
  noClickAway?: boolean; // if true, no click-away-to-close
}

export interface DomDialogOpts extends DialogOpts {
  parent?: Element; // for centering and dom placement, otherwise fixed on document.body
  show?: 'modal' | boolean; // if not falsy, auto-show, and if 'modal' remove from dom on close
}

export interface SnabDialogOpts extends DialogOpts {
  vnodes?: MaybeVNodes; // snabDialog auto-shows by default, but you must still call redraw
  onInsert?: (dialog: Dialog) => void; // prevents showModal, caller must do so manually
}

// if no 'show' in opts, you must call show or showModal on the resolved promise
export async function domDialog(o: DomDialogOpts): Promise<Dialog> {
  const [html] = await assets(o);

  const dialog = document.createElement('dialog');
  for (const [k, v] of Object.entries(o.attrs?.dialog ?? {})) dialog.setAttribute(k, String(v));
  if (isTouchDevice()) dialog.classList.add('touch-scroll');
  if (o.parent) dialog.style.position = 'absolute';

  if (!o.noCloseButton) {
    const anchor = $as<Element>('<div class="close-button-anchor">');
    anchor.innerHTML = `<button class="close-button" aria-label="Close" data-icon="${licon.X}">`;
    dialog.appendChild(anchor);
  }

  const view = $as<HTMLElement>('<div class="dialog-content">');
  if (o.class) view.classList.add(...o.class.split('.'));
  for (const [k, v] of Object.entries(o.attrs?.view ?? {})) view.setAttribute(k, String(v));
  if (html) view.innerHTML = html;

  const scrollable = $as<Element>('<div class="scrollable">');
  scrollable.appendChild(view);
  dialog.appendChild(scrollable);

  (o.parent ?? document.body).appendChild(dialog);

  const wrapper = new DialogWrapper(dialog, view, o);
  if (o.show && o.show === 'modal') wrapper.showModal();
  else if (o.show) wrapper.show();

  return wrapper;
}

// snab dialogs are shown by default, to suppress this pass onInsert callback
export function snabDialog(o: SnabDialogOpts): VNode {
  const ass = assets(o);
  let dialog: HTMLDialogElement;

  return h(
    `dialog${isTouchDevice() ? '.touch-scroll' : ''}`,
    {
      key: o.class ?? 'dialog',
      attrs: o.attrs?.dialog,
      hook: onInsert(el => (dialog = el as HTMLDialogElement)),
    },
    [
      o.noCloseButton ||
        h(
          'div.close-button-anchor',
          h('button.close-button', { attrs: { 'data-icon': licon.X, 'aria-label': 'Close' } }),
        ),
      h(
        'div.scrollable',
        h(
          'div.dialog-content' + (o.class ? `.${o.class}` : ''),
          {
            attrs: o.attrs?.view,
            hook: onInsert(async view => {
              const [html] = await ass;
              if (html && !o.vnodes) view.innerHTML = html;

              const wrapper = new DialogWrapper(dialog, view, o);

              if (o.onInsert) o.onInsert(wrapper);
              else wrapper.showModal();
            }),
          },
          o.vnodes,
        ),
      ),
    ],
  );
}

class DialogWrapper implements Dialog {
  restoreFocus?: HTMLElement;

  constructor(
    readonly dialog: HTMLDialogElement,
    readonly view: HTMLElement,
    readonly o: DialogOpts,
  ) {
    if (dialogPolyfill) dialogPolyfill.registerDialog(dialog); // ios < 15.4

    view.parentElement?.style.setProperty('--vh', `${window.innerHeight}px`); // sigh
    view.addEventListener('click', e => e.stopPropagation());

    dialog.addEventListener('cancel', () => !this.returnValue && (this.returnValue = 'cancel'));
    dialog.addEventListener('close', this.onClose);
    dialog
      .querySelector('.close-button-anchor > .close-button')
      ?.addEventListener('click', () => this.close('cancel'));

    if (!o.noClickAway) setTimeout(() => dialog.addEventListener('click', () => this.close('cancel')), 0);
  }

  get open() {
    return this.dialog.open;
  }

  get returnValue() {
    return this.dialog.returnValue;
  }

  set returnValue(v: string) {
    this.dialog.returnValue = v;
  }

  show = () => {
    this.returnValue = '';
    this.dialog.show();
  };

  close = (v?: string) => {
    this.dialog.close(this.returnValue || v || 'ok');
  };

  onClose = () => {
    if (!this.dialog.returnValue) this.dialog.returnValue = 'cancel';
    this.o.onClose?.(this);
    if ('show' in this.o && this.o.show === 'modal') {
      this.dialog.remove();
      this.restoreFocus?.focus();
    }
    this.restoreFocus = undefined;
  };

  showModal = () => {
    this.restoreFocus = document.activeElement as HTMLElement;
    $(focusQuery, this.view)[1]?.focus();
    this.view.scrollTop = 0;

    this.addModalListeners?.();
    this.returnValue = '';
    this.dialog.showModal();
  };

  addModalListeners? = () => {
    this.dialog.addEventListener('keydown', onModalKeydown);
    this.addModalListeners = undefined; // only do this once per HTMLDialogElement
  };
}

function assets(o: DialogOpts) {
  return Promise.all([
    o.htmlUrl
      ? xhr.text(o.htmlUrl)
      : Promise.resolve(
          o.cash ? $as<HTMLElement>($(o.cash).clone().removeClass('none')).outerHTML : o.htmlText,
        ),
    o.cssPath ? lichess.loadCssPath(o.cssPath) : Promise.resolve(),
  ]);
}

function onModalKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab') {
    const $focii = $(focusQuery, e.currentTarget as Element),
      first = $as<HTMLElement>($focii.first()),
      last = $as<HTMLElement>($focii.last()),
      focus = document.activeElement as HTMLElement;
    if (focus === last && !e.shiftKey) first.focus();
    else if (focus === first && e.shiftKey) last.focus();
    else return;
    e.preventDefault();
  }
  e.stopPropagation();
}

function onResize() {
  // ios safari vh behavior not helpful to us
  $('dialog > div.scrollable').css('--vh', `${window.innerHeight}px`);
}

const focusQuery = ['button', 'input', 'select', 'textarea']
  .map(sel => `${sel}:not(:disabled)`)
  .concat(['[href]', '[tabindex="0"]', '[role="tab"]'])
  .join(',');
