/* Virtueasy conversion tracking.
   The Meta Pixel base code + PageView is inline in <head> on every page.
   This file adds the conversion events on top of it: ViewContent on the
   product pages, InitiateCheckout on the Stripe buttons, Lead on a
   completed MailerLite signup. Purchase is fired inline on the three
   unlock.html pages, because only those know the payment was verified. */
(function () {
  "use strict";

  var PRODUCTS = {
    starterkit:     { name: "VA Starter Kit",           value: 27 },
    onboarding:     { name: "VA Client Onboarding Kit", value: 7  },
    "pricing-tool": { name: "Pricing Tool Lifetime",    value: 7  }
  };

  // Trailing chunk of each Stripe payment link -> product key.
  var CHECKOUT_LINKS = {
    "63K05": "starterkit",
    "63K07": "onboarding",
    "63K06": "pricing-tool"
  };

  // Page path (prefix match) -> product key, for ViewContent.
  var PRODUCT_PAGES = [
    ["/starterkit/preview", "starterkit"],
    ["/starterkit/index",   "starterkit"],
    ["/starterkit/",        "starterkit"],
    ["/onboarding-kit/index", "onboarding"],
    ["/onboarding-kit/",      "onboarding"],
    ["/pricing-tool/pay",   "pricing-tool"]
  ];

  function track(event, product, extra) {
    if (typeof window.fbq !== "function") return;
    var p = PRODUCTS[product];
    var data = p
      ? { content_name: p.name, content_ids: [product], content_type: "product",
          value: p.value, currency: "USD" }
      : {};
    if (extra) for (var k in extra) data[k] = extra[k];
    window.fbq("track", event, data);
  }

  /* ---- ViewContent -------------------------------------------------- */
  function viewContent() {
    var path = window.location.pathname;
    // Gated pages are not product views - the buyer is already past them.
    if (/\/(dashboard|login|unlock|app|ok-2026-access)\.html$/.test(path)) return;
    for (var i = 0; i < PRODUCT_PAGES.length; i++) {
      if (path.indexOf(PRODUCT_PAGES[i][0]) === 0) {
        track("ViewContent", PRODUCT_PAGES[i][1]);
        return;
      }
    }
  }

  /* ---- InitiateCheckout --------------------------------------------- */
  function watchCheckoutLinks() {
    document.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href*="buy.stripe.com"]') : null;
      if (!a) return;
      var href = a.getAttribute("href") || "";
      for (var suffix in CHECKOUT_LINKS) {
        if (href.indexOf(suffix) !== -1) {
          track("InitiateCheckout", CHECKOUT_LINKS[suffix], { num_items: 1 });
          return;
        }
      }
      track("InitiateCheckout", null, { currency: "USD" });
    }, true);
  }

  /* ---- Lead (MailerLite signup) -------------------------------------- */
  function watchMailerLite() {
    var panels = document.querySelectorAll(".ml-form-successBody");
    if (!panels.length) return;
    var fired = false;

    function check() {
      if (fired) return;
      for (var i = 0; i < panels.length; i++) {
        // offsetParent is null while MailerLite keeps the panel display:none.
        if (panels[i].offsetParent !== null) {
          fired = true;
          observer.disconnect();
          track("Lead", null, {
            content_name: "Email signup",
            content_category: window.location.pathname
          });
          return;
        }
      }
    }

    var observer = new MutationObserver(check);
    for (var i = 0; i < panels.length; i++) {
      observer.observe(panels[i], { attributes: true, attributeFilter: ["style", "class"] });
      if (panels[i].parentNode) {
        observer.observe(panels[i].parentNode, { attributes: true, childList: true });
      }
    }
    check();
  }

  function init() {
    viewContent();
    watchCheckoutLinks();
    watchMailerLite();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
