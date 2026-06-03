/* ============================================================
   Article-side scrollytelling driver.

   The scrolly iframe (scrolly.html?embed=1) only renders the map and
   listens for {type:"step", index:N} postMessage events. Here we use
   an IntersectionObserver to detect which .scrolly__box is in the
   viewport's center and post the corresponding step index across.
   ============================================================ */

(function () {
  const iframe = document.getElementById("scrolly-iframe");
  if (!iframe) return;

  const boxes = document.querySelectorAll(".scrolly__box");

  // Track the last step we sent so we don't spam the iframe with
  // identical messages while a card lingers in view.
  let lastSentStep = -1;

  function sendStep(index) {
    if (index === lastSentStep) return;
    lastSentStep = index;
    // contentWindow may not yet exist on very first paint; defer a tick.
    if (!iframe.contentWindow) {
      setTimeout(() => sendStep(index), 50);
      return;
    }
    iframe.contentWindow.postMessage({ type: "step", index }, "*");
  }

  // Fire when a card crosses 55% of the viewport, like Scrollama uses
  // internally. rootMargin tightens the trigger zone to the centre.
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const index = parseInt(entry.target.dataset.step, 10);
        if (Number.isFinite(index)) sendStep(index);
      }
    },
    { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
  );

  boxes.forEach((box) => observer.observe(box));

  // Make sure step 0 is applied once the iframe has loaded (otherwise
  // the map sits at its initial state until the first card hits the
  // trigger zone).
  iframe.addEventListener("load", () => {
    setTimeout(() => sendStep(0), 200);
  });
})();
