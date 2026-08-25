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
    ["/pricing-tool/pay",   "pricing-tool"],
    ["/pricing-tool/index", "pricing-tool"],
    ["/pricing-tool/",      "pricing-tool"],
    ["/pricing-tool.html",  "pricing-tool"]
  ];

  // Free lead magnets that live under a product path. They are a Lead, not a
  // $7 product view, so they must not be counted as ViewContent.
  var NOT_A_PRODUCT_VIEW = /\/(get-access|dashboard|login|unlock|app|ok-2026-access)\.html$/;

  // Clarity mirror of the pixel events, so sessions can be filtered by the
  // same funnel moments. Purchase and tool_use fire from their own pages.
  var CLARITY_EVENTS = { InitiateCheckout: "checkout_start", Lead: "email_signup" };

  function track(event, product, extra) {
    if (CLARITY_EVENTS[event] && typeof window.clarity === "function") {
      try { window.clarity("event", CLARITY_EVENTS[event]); } catch (e) {}
    }
    if (typeof window.fbq !== "function") return;
    var p = PRODUCTS[product];
    var data = p
      ? { content_name: p.name, content_ids: [product], content_type: "product",
          value: p.value, currency: "USD" }
      : {};
    if (extra) for (var k in extra) data[k] = extra[k];
    window.fbq("track", event, data);
  }

  // True when this document is inside an iframe. /starterkit/ embeds
  // preview.html, which carries its own pixel, so an unguarded page-load
  // event fires twice on one visit and Meta cannot dedupe them.
  function framed() {
    try { return window.top !== window.self; } catch (e) { return true; }
  }

  /* ---- ViewContent -------------------------------------------------- */
  function viewContent() {
    if (framed()) return;
    var path = window.location.pathname;
    // Gated pages are not product views - the buyer is already past them.
    if (NOT_A_PRODUCT_VIEW.test(path)) return;
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
  /* webforms.min.js rebuilds the embed after we run, so the .ml-form-successBody
     node present at DOMContentLoaded is thrown away and replaced. Binding an
     observer to those original nodes silently watched detached elements and no
     Lead ever fired. Watch the document instead and re-query every time. */
  function watchMailerLite() {
    if (framed()) return;
    // Only three pages carry a MailerLite embed. Everywhere else (36 blog posts,
    // /starterkit/, /resources/, the job board) this observer would watch the
    // whole document for the lifetime of the session and find nothing, running a
    // full-document querySelectorAll on every class/style mutation.
    if (!document.querySelector(".ml-form-embedContainer, .ml-block-form, .ml-form-successBody")) return;
    var fired = false;

    function check() {
      if (fired) return true;
      var panels = document.querySelectorAll(".ml-form-successBody");
      for (var i = 0; i < panels.length; i++) {
        // offsetParent is null while MailerLite keeps the panel display:none.
        if (panels[i].offsetParent !== null) {
          fired = true;
          observer.disconnect();
          clearInterval(poll);
          track("Lead", null, {
            content_name: "Email signup",
            content_category: window.location.pathname
          });
          return true;
        }
      }
      return false;
    }

    var observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ["style", "class"]
    });

    // Backstop: MailerLite can swap the panel in a way that produces no
    // mutation we are watching. Give up after two minutes on the page.
    var poll = setInterval(check, 1000);
    setTimeout(function () {
      clearInterval(poll);
      observer.disconnect();
    }, 120000);

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
