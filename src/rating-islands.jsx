import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import PeekRating from './components/PeekRating.jsx';
import './components/survey-peek-rating.css';

function RatingIsland({ input, prompt, controller }) {
  const [value, setValue] = useState(0);
  const [disabled, setDisabled] = useState(false);
  const [instance, setInstance] = useState(0);

  controller.reset = () => {
    input.value = '';
    setValue(0);
    setDisabled(false);
    setInstance((current) => current + 1);
  };
  controller.lock = () => { setDisabled(true); };
  controller.clearPreview = () => { setInstance((current) => current + 1); };

  return (
    <PeekRating
      key={instance}
      value={value}
      onChange={(next) => {
        input.value = next === 0 ? '' : String(next);
        input.dispatchEvent(new Event('change', { bubbles: true }));
        setValue(next);
      }}
      count={5}
      size={38}
      activeColor="#e5a219"
      idleColor="#a99b80"
      tipColor="#483006"
      tipTextColor="#fff9e9"
      ariaLabel={prompt}
      disabled={disabled}
    />
  );
}

export function mountPeekRatings(form) {
  return [...form.querySelectorAll('.rating-field')].map((fieldset) => {
    const input = fieldset.querySelector('input[type="hidden"]');
    const prompt = fieldset.querySelector('legend').textContent;
    const controller = { reset() {}, lock() {}, clearPreview() {} };
    createRoot(fieldset.querySelector('.rating-mount')).render(
      <RatingIsland input={input} prompt={prompt} controller={controller} />,
    );
    return controller;
  });
}
