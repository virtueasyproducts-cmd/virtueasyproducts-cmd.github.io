/* Free-kit giveaway, 2026-09-19 through 2026-10-20.
 *
 * Loaded by track.js on every page. While the window is open it does three things:
 *   1. Adds ?prefilled_promo_code=FREEKIT to every Starter Kit and Onboarding Kit
 *      Payment Link, so Stripe Checkout opens at $0 with no card field.
 *   2. Rewrites the price on buy buttons and price blocks to show the kit is free.
 *   3. Puts an announcement bar at the top of the page.
 *
 * After END it does nothing at all, so the site reverts to full price on its own.
 * The matching server-side window lives in the virtueasy-pricing-tool-verification
 * worker (FREE_PROMO), and the Stripe promotion code carries its own expiry.
 * To end the promo early: deactivate the FREEKIT code in Stripe and set END to the past.
 */
(function () {
  "use strict";

  var END = Date.parse("2026-10-21T08:00:00Z"); // end of Oct 20, Pacific
  var CODE = "FREEKIT";
  var END_LABEL = "Oct 20";
  var KIT_LINKS = {
    "bJe14ngv08Qo87h5EqdAk00": { price: "$27", path: "/starterkit/" },
    "cNiaEXfqW0jS73d4AmdAk01": { price: "$7", path: "/onboarding-kit/" }
  };
  // Pages that sit behind the purchase. No banner, nothing to sell.
  var QUIET_PAGES = /\/(unlock|dashboard|login|ok-2026-access|app)(\.html)?$/;

  if (Date.now() >= END) return;

  function kitFor(href) {
    if (!href || href.indexOf("buy.stripe.com") === -1) return null;
    for (var id in KIT_LINKS) {
      if (href.indexOf(id) !== -1) return KIT_LINKS[id];
    }
    return null;
  }

  // URL API rather than string concat: Rewardful also appends a query param to these
  // links, and whichever of us runs second must not produce a second "?".
  function withCode(href) {
    try {
      var url = new URL(href);
      url.searchParams.set("prefilled_promo_code", CODE);
      return url.toString();
    } catch (e) {
      return href;
    }
  }

  function freeText(text, price) {
    var p = price.replace("$", "\\$");
    return text
      .replace(new RegExp("\\s+for\\s+" + p + "(?![\\d.])"), " Free")
      .replace(new RegExp("-\\s*" + p + "(?![\\d.])"), "- Free");
  }

  function rewriteLinks() {
    var links = document.querySelectorAll('a[href*="buy.stripe.com"]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var kit = kitFor(a.getAttribute("href"));
      if (!kit) continue;
      a.setAttribute("href", withCode(a.href));
      if (a.children.length === 0 && a.textContent.indexOf(kit.price) !== -1) {
        a.textContent = freeText(a.textContent, kit.price);
      }
    }
  }

  // Standalone price blocks on the two sales pages. The price stays visible, struck
  // through, so the offer reads as a $27 product that is free right now.
  function rewritePriceBlocks() {
    var path = window.location.pathname;
    var price = path.indexOf("/starterkit") === 0 ? "$27" : path.indexOf("/onboarding-kit") === 0 ? "$7" : null;
    if (!price) return;
    var nodes = document.querySelectorAll(".hero-price-num, .pricing-amount, .price-num");
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].textContent.trim() !== price) continue;
      nodes[i].innerHTML = '<s style="opacity:.6;font-size:.55em;margin-right:.25em">' + price + "</s>Free";
    }
    var notes = document.querySelectorAll(".hero-price-note, .pricing-note");
    for (var j = 0; j < notes.length; j++) {
      notes[j].textContent = "Free through " + END_LABEL + ". No card needed. Yours forever.";
    }
    var bar = document.querySelector(".mobile-buy-copy");
    if (bar) bar.innerHTML = "<strong>VA Starter Kit &middot; Free</strong>Through " + END_LABEL + ", no card needed";
  }

  function addBanner() {
    if (QUIET_PAGES.test(window.location.pathname) || document.getElementById("ve-promo-bar")) return;
    var onKitPage = /^\/(starterkit|onboarding-kit)\//.test(window.location.pathname);
    var bar = document.createElement("div");
    bar.id = "ve-promo-bar";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Announcement");
    bar.style.cssText = "background:#0A0A0A;color:#F8F8F8;font-family:Barlow,Arial,sans-serif;font-size:15px;line-height:1.4;text-align:center;padding:10px 16px;border-bottom:3px solid #FF1F7A;position:relative;z-index:50";
    var linkStyle = "color:#FF1F7A;font-weight:700;text-decoration:underline;white-space:nowrap";
    var narrow = window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
    if (narrow) bar.style.fontSize = "14px";
    // Phones get the short version. The long one wraps to five lines at 400px.
    bar.innerHTML = narrow
      ? 'The <a style="' + linkStyle + '" href="/starterkit/">VA Starter Kit</a> and ' +
        '<a style="' + linkStyle + '" href="/onboarding-kit/">Onboarding Kit</a> are free through ' + END_LABEL + ". No card needed."
      : "Everything costs more right now, so this one is on us. The " +
        '<a style="' + linkStyle + '" href="/starterkit/">VA Starter Kit ($27)</a> and ' +
        '<a style="' + linkStyle + '" href="/onboarding-kit/">Client Onboarding Kit ($7)</a> ' +
        "are free through " + END_LABEL + ". No card needed." +
        (onKitPage ? "" : ' <a style="' + linkStyle + '" href="/starterkit/">Get yours &rarr;</a>');
    document.body.insertBefore(bar, document.body.firstChild);
  }

  function run() {
    rewriteLinks();
    rewritePriceBlocks();
    addBanner();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();

  // Last look at click time, in case another script rewrote the href after we did.
  document.addEventListener("click", function (event) {
    var a = event.target && event.target.closest ? event.target.closest('a[href*="buy.stripe.com"]') : null;
    if (a && kitFor(a.getAttribute("href"))) a.setAttribute("href", withCode(a.href));
  }, true);
})();
