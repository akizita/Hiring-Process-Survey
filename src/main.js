import { buildPayload, classifyResponse, RECRUITERS, RATINGS, validFeedback, normalizeFeedback, SUCCESS_MESSAGE, SUBMISSION_ERROR_MESSAGE } from './survey.js';

const card = document.querySelector('.survey-card');
const splash = document.querySelector('#splash-screen');
const splashVideo = document.querySelector('#splash-video');
const form = document.querySelector('#survey-form');
const steps = [...form.querySelectorAll('[data-form-step]')];
const caption = document.querySelector('#step-caption');
const progressSegments = [...document.querySelectorAll('.progress-track span')];
const modal = document.querySelector('#feedback-modal');
const modalPanel = modal.querySelector('.modal-panel');
const modalTitle = document.querySelector('#modal-title');
const modalMessage = document.querySelector('#modal-message');
const modalClose = document.querySelector('#modal-close');
const privacyContent = document.querySelector('#privacy-content');
const privacyActions = document.querySelector('#privacy-actions');
const privacyScrollHint = document.querySelector('#privacy-scroll-hint');
const privacyAcknowledgment = document.querySelector('#privacy-ack');
const privacyCancel = document.querySelector('#privacy-cancel');
const privacyConfirm = document.querySelector('#privacy-confirm');
const button = document.querySelector('#submit-button');
const buttonLabel = button.querySelector('.button-label');
const backButtons = [...form.querySelectorAll('[data-back]')];
const recruiterField = form.elements.namedItem('recruiterName');
const ratingNames = ['professionalismRating', 'roleClarityRating', 'overallRating'];
const feedbackField = form.elements.namedItem('recruiterFeedback');
const improvementsField = form.elements.namedItem('processImprovements');
const stepNames = ['Recruiter', 'Your ratings', 'Your feedback'];

let step = 0;
let requestId;
let submitting = false;
let submitted = false;
let splashFinished = false;
let splashTimer;
let splashStartupTimer;
let splashStallTimer;
let splashFallbackTimer;
let modalReturnFocus;
const dropdownControllers = [];

function dismissSplash() {
  if (splashFinished) return;
  splashFinished = true;
  window.clearTimeout(splashTimer);
  window.clearTimeout(splashStartupTimer);
  window.clearTimeout(splashStallTimer);
  window.clearTimeout(splashFallbackTimer);
  splashVideo.pause();
  card.inert = false;
  card.classList.add('is-ready');
  splash.classList.add('is-leaving');
  splash.setAttribute('aria-hidden', 'true');
  splash.inert = true;
  window.setTimeout(() => {
    splash.hidden = true;
    splashVideo.removeAttribute('src');
    splashVideo.load();
  }, 400);
}

if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  dismissSplash();
} else {
  function showSplashFallback() {
    if (splashFinished || splash.classList.contains('is-video-playing') || splash.classList.contains('is-fallback')) return;
    window.clearTimeout(splashStartupTimer);
    splashVideo.pause();
    splash.classList.add('is-fallback', 'is-animating');
    splashFallbackTimer = window.setTimeout(dismissSplash, 2200);
  }

  function showSplashVideo() {
    if (splashFinished || splash.classList.contains('is-fallback')) return;
    window.clearTimeout(splashStartupTimer);
    splash.classList.add('is-video-playing');
  }

  const videoSource = window.matchMedia('(max-aspect-ratio: 3/4)').matches
    ? '/assets/opg-afterfx-portrait.mp4'
    : window.matchMedia('(min-aspect-ratio: 2/1)').matches
      ? '/assets/opg-afterfx-wide.mp4'
    : window.matchMedia('(max-width: 1440px), (max-height: 600px)').matches
      ? '/assets/opg-afterfx-compact.mp4'
      : '/assets/opg-afterfx-desktop.mp4';
  splashVideo.addEventListener('playing', () => {
    window.clearTimeout(splashStallTimer);
    if (splashVideo.requestVideoFrameCallback) {
      splashVideo.requestVideoFrameCallback(showSplashVideo);
    } else {
      window.requestAnimationFrame(showSplashVideo);
    }
  });
  splashVideo.addEventListener('waiting', () => {
    if (!splash.classList.contains('is-video-playing')) return;
    window.clearTimeout(splashStallTimer);
    splashStallTimer = window.setTimeout(dismissSplash, 1200);
  });
  splashVideo.addEventListener('ended', dismissSplash, { once: true });
  splashVideo.addEventListener('error', showSplashFallback);
  splashTimer = window.setTimeout(dismissSplash, 5200);
  splashStartupTimer = window.setTimeout(showSplashFallback, 1800);
  splashVideo.src = videoSource;
  splashVideo.play().catch(showSplashFallback);
}

function openModal({ state = 'notice', title, message, action = 'OK', returnFocus = caption }) {
  dropdownControllers.forEach((controller) => controller.close());
  modalReturnFocus = returnFocus;
  modalPanel.dataset.state = state;
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  modalClose.textContent = action;
  const isPrivacy = state === 'privacy';
  privacyContent.hidden = !isPrivacy;
  privacyActions.hidden = !isPrivacy;
  modalClose.hidden = isPrivacy;
  if (isPrivacy) {
    privacyAcknowledgment.checked = false;
    privacyAcknowledgment.disabled = true;
    privacyConfirm.disabled = true;
    privacyScrollHint.hidden = false;
  }
  card.inert = true;
  modal.hidden = false;
  if (isPrivacy) {
    privacyContent.scrollTop = 0;
    updatePrivacyReadiness();
    privacyContent.focus({ preventScroll: true });
  } else {
    modalClose.focus({ preventScroll: true });
  }
}

function updatePrivacyReadiness() {
  if (modalPanel.dataset.state !== 'privacy' || !privacyAcknowledgment.disabled) return;
  if (privacyContent.scrollTop + privacyContent.clientHeight < privacyContent.scrollHeight - 2) return;
  privacyAcknowledgment.disabled = false;
  privacyScrollHint.hidden = true;
}

function closeModal() {
  if (modal.hidden) return;
  const restartAfterSuccess = submitted && modalPanel.dataset.state === 'success';
  modal.hidden = true;
  card.inert = false;
  if (restartAfterSuccess) {
    resetSurvey();
    return;
  }
  const target = modalReturnFocus?.isConnected && !modalReturnFocus.disabled ? modalReturnFocus : caption;
  target.focus();
}

modalClose.addEventListener('click', closeModal);
privacyCancel.addEventListener('click', closeModal);
privacyContent.addEventListener('scroll', updatePrivacyReadiness);
privacyAcknowledgment.addEventListener('change', () => {
  privacyConfirm.disabled = !privacyAcknowledgment.checked;
});
privacyConfirm.addEventListener('click', () => {
  if (modalPanel.dataset.state !== 'privacy' || !privacyAcknowledgment.checked || privacyConfirm.disabled) return;
  closeModal();
  void submitResponse();
});
modal.addEventListener('click', (event) => {
  if (event.target === modal) closeModal();
});
modal.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeModal();
  } else if (event.key === 'Tab') {
    const focusable = [...modalPanel.querySelectorAll('button, input[type="checkbox"], [tabindex="0"]')]
      .filter((element) => !element.disabled && element.getClientRects().length);
    const first = focusable[0];
    const last = focusable.at(-1);
    if ((event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement)))
      || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  }
});

function showNotice(title, message, returnFocus) {
  openModal({ title, message, returnFocus });
}

function createDropdown(select) {
  const root = document.querySelector(`[data-dropdown="${select.id}"]`);
  const trigger = root.querySelector('.dropdown-trigger');
  const display = trigger.querySelector('span');
  const list = root.querySelector('.dropdown-list');
  const items = [...select.options].filter((option) => option.value).map((option, index) => {
    const item = document.createElement('li');
    item.id = `${select.id}-option-${index}`;
    item.role = 'option';
    item.tabIndex = -1;
    item.dataset.value = option.value;
    item.textContent = option.textContent;
    item.setAttribute('aria-selected', 'false');
    list.append(item);
    return item;
  });

  function sync() {
    const selected = [...select.options].find((option) => option.value === select.value);
    display.textContent = selected?.textContent || select.options[0].textContent;
    root.classList.toggle('is-filled', Boolean(select.value));
    items.forEach((item) => item.setAttribute('aria-selected', String(item.dataset.value === select.value)));
  }

  function close() {
    list.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    root.classList.remove('is-open');
  }

  function focusItem(item) {
    item?.focus({ preventScroll: true });
    if (!item) return;
    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (itemRect.bottom > listRect.bottom - 6) list.scrollTop += itemRect.bottom - listRect.bottom + 6;
    if (itemRect.top < listRect.top + 6) list.scrollTop -= listRect.top - itemRect.top + 6;
  }

  function open(focusOption = false, preferLast = false) {
    dropdownControllers.forEach((controller) => controller.close());
    if (list.parentNode !== document.body) document.body.append(list);
    list.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    root.classList.add('is-open');
    const triggerRect = trigger.getBoundingClientRect();
    const availableBelow = innerHeight - triggerRect.bottom - 16;
    const availableAbove = triggerRect.top - 16;
    const desiredHeight = Math.min(232, list.scrollHeight);
    const placeAbove = availableBelow < desiredHeight && availableAbove > availableBelow;
    root.dataset.placement = placeAbove ? 'above' : 'below';
    const height = Math.max(36, Math.min(232, placeAbove ? availableAbove : availableBelow));
    list.style.maxHeight = `${height}px`;
    list.style.left = `${triggerRect.left}px`;
    list.style.width = `${triggerRect.width}px`;
    list.style.top = placeAbove ? `${triggerRect.top - height - 8}px` : `${triggerRect.bottom + 8}px`;
    if (focusOption) {
      const selectedIndex = items.findIndex((item) => item.dataset.value === select.value);
      focusItem(items[selectedIndex >= 0 ? selectedIndex : preferLast ? items.length - 1 : 0]);
    }
  }

  function choose(item) {
    select.value = item.dataset.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    close();
    trigger.focus({ preventScroll: true });
  }

  trigger.addEventListener('click', () => {
    if (list.hidden) open(); else close();
  });
  trigger.addEventListener('keydown', (event) => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      open(true, event.key === 'ArrowUp' || event.key === 'End');
    } else if (event.key === 'Escape') {
      close();
    }
  });
  items.forEach((item) => item.addEventListener('click', () => choose(item)));
  list.addEventListener('keydown', (event) => {
    const current = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      focusItem(items[(current + delta + items.length) % items.length]);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      focusItem(items[event.key === 'Home' ? 0 : items.length - 1]);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (current >= 0) choose(items[current]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
      trigger.focus({ preventScroll: true });
    } else if (event.key === 'Tab') {
      close();
    }
  });
  root.addEventListener('focusout', (event) => {
    if (!root.contains(event.relatedTarget) && !list.contains(event.relatedTarget)) close();
  });
  list.addEventListener('focusout', (event) => {
    if (!root.contains(event.relatedTarget) && !list.contains(event.relatedTarget)) close();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!root.contains(event.target) && !list.contains(event.target)) close();
  });
  card.addEventListener('scroll', close);
  window.addEventListener('resize', close);
  select.addEventListener('change', sync);
  sync();
  return {
    close,
    trigger,
    lock: () => { trigger.disabled = true; select.disabled = true; },
    reset: () => { trigger.disabled = false; select.disabled = false; sync(); },
  };
}

dropdownControllers.push(createDropdown(recruiterField));

function setStep(nextStep) {
  dropdownControllers.forEach((controller) => controller.close());
  step = nextStep;
  card.dataset.step = String(step);
  card.setAttribute('aria-labelledby', 'page-title');
  steps.forEach((panel, index) => { panel.hidden = index !== step; });
  progressSegments.forEach((segment, index) => { segment.classList.toggle('active', index <= step); });
  caption.textContent = `Step ${step + 1} of 3 · ${stepNames[step]}`;
  card.scrollTop = 0;
  caption.focus({ preventScroll: true });
}

function resetSurvey() {
  form.reset();
  feedbackField.readOnly = false;
  improvementsField.readOnly = false;
  form.querySelectorAll('input[type="radio"]').forEach((radio) => { radio.disabled = false; });
  dropdownControllers.forEach((dropdown) => dropdown.reset());
  form.removeAttribute('data-submitted');
  form.removeAttribute('aria-busy');
  button.disabled = false;
  buttonLabel.textContent = 'Submit response';
  backButtons.forEach((backButton) => { backButton.disabled = false; });
  requestId = undefined;
  submitted = false;
  setStep(0);
}

function validateStep(index) {
  if (index === 0) {
    if (!RECRUITERS.includes(recruiterField.value)) {
      showNotice('Choose a recruiter', 'Please select a recruiter to continue.', dropdownControllers[0].trigger);
      return false;
    }
    return true;
  }
  if (index === 1) {
    for (const name of ratingNames) {
      if (!RATINGS.includes(form.elements.namedItem(name).value)) {
        const fieldset = form.querySelector(`[data-rating="${name}"]`);
        showNotice('Choose a rating', 'Please choose a rating for each question to continue.', fieldset.querySelector('input'));
        return false;
      }
    }
    return true;
  }
  if (!validFeedback(normalizeFeedback(feedbackField.value))) {
    showNotice('Add your feedback', 'Please answer the first written question in 4,000 characters or fewer.', feedbackField);
    return false;
  }
  if (!validFeedback(normalizeFeedback(improvementsField.value))) {
    showNotice('Add your suggestions', 'Please answer the second written question in 4,000 characters or fewer.', improvementsField);
    return false;
  }
  return true;
}

form.querySelectorAll('[data-next]').forEach((nextButton) => {
  nextButton.addEventListener('click', () => {
    if (submitted || validateStep(step)) setStep(step + 1);
  });
});
backButtons.forEach((backButton) => {
  backButton.addEventListener('click', () => setStep(step - 1));
});

async function submitResponse() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);

  try {
    requestId ??= window.crypto.randomUUID();
    const payload = buildPayload({
      recruiterName: recruiterField.value,
      professionalismRating: form.elements.namedItem('professionalismRating').value,
      roleClarityRating: form.elements.namedItem('roleClarityRating').value,
      overallRating: form.elements.namedItem('overallRating').value,
      recruiterFeedback: feedbackField.value,
      processImprovements: improvementsField.value,
      website: form.elements.namedItem('website').value,
    }, requestId);

    submitting = true;
    form.setAttribute('aria-busy', 'true');
    button.disabled = true;
    backButtons.forEach((backButton) => { backButton.disabled = true; });
    buttonLabel.textContent = 'Submitting…';

    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
      credentials: 'omit',
    });
    const body = await response.json().catch(() => null);

    if (classifyResponse(response.status, body) === 'success') {
      submitted = true;
      form.dataset.submitted = 'true';
      feedbackField.readOnly = true;
      improvementsField.readOnly = true;
      form.querySelectorAll('input[type="radio"]').forEach((radio) => { radio.disabled = true; });
      dropdownControllers.forEach((dropdown) => dropdown.lock());
      openModal({
        state: 'success',
        title: 'Response Saved',
        message: SUCCESS_MESSAGE,
        action: 'Done',
        returnFocus: caption,
      });
    } else {
      throw new Error('Response was not saved');
    }
  } catch {
    openModal({
      title: 'We could not save your response',
      message: SUBMISSION_ERROR_MESSAGE,
      action: 'Try again',
      returnFocus: button,
    });
  } finally {
    window.clearTimeout(timeout);
    submitting = false;
    form.removeAttribute('aria-busy');
    buttonLabel.textContent = submitted ? 'Response submitted' : 'Submit response';
    button.disabled = submitted;
    backButtons.forEach((backButton) => { backButton.disabled = false; });
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (submitting || submitted || !modal.hidden) return;
  if (step < 2) {
    if (validateStep(step)) setStep(step + 1);
    return;
  }
  if (!validateStep(2)) return;
  openModal({
    state: 'privacy',
    title: 'Data Privacy Disclaimer',
    message: 'Review the notice below before submitting your response.',
    returnFocus: button,
  });
});
