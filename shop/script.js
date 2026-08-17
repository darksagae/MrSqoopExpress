(function () {
  var stage = document.getElementById('heroMotion');
  if (!stage || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.matchMedia('(pointer: coarse)').matches) return;

  var raf = 0;
  var targetX = 0;
  var targetY = 0;
  var currentX = 0;
  var currentY = 0;

  function onMove(e) {
    var rect = stage.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    targetX = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width * 0.55)));
    targetY = Math.max(-1, Math.min(1, (e.clientY - cy) / (rect.height * 0.55)));
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick() {
    currentX += (targetX - currentX) * 0.08;
    currentY += (targetY - currentY) * 0.08;

    // Tip the whole stage slightly — phone stays center, orbit tilts with it
    stage.style.setProperty('--rx', (-currentY * 8).toFixed(2) + 'deg');
    stage.style.setProperty('--ry', (currentX * 10).toFixed(2) + 'deg');

    var settled =
      Math.abs(targetX - currentX) < 0.002 &&
      Math.abs(targetY - currentY) < 0.002;

    if (settled) {
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  stage.addEventListener('mousemove', onMove);
  stage.addEventListener('mouseleave', function () {
    targetX = 0;
    targetY = 0;
    if (!raf) raf = requestAnimationFrame(tick);
  });
})();

/* ===== Cart + product quick-view ===== */
(function () {
  // Short descriptions keyed by exact product name
  var DESC = {
    'Wireless Lavalier Microphone Set': 'A dual clip-on microphone set with a USB-C receiver and Lightning adapter — perfect for interviews, vlogging and crisp smartphone recording.',
    'Deep Tissue Massage Gun': 'Handheld percussion massager with a matte-black body, chrome accents and a round ball head. Powerful, quiet muscle recovery at home or the gym.',
    'EDUP Wi-Fi Router & Extender': 'High-gain router and signal booster with a sleek low-profile body and 4 external antennas for strong, broad whole-home coverage.',
    'Ultrasonic Pest Repeller': 'Wall-plug device that emits ultrasonic frequencies to repel mosquitoes, flies, cockroaches and rodents — chemical-free and safe indoors.',
    'South Moon Bee Venom Cream (60g)': 'Topical bone-soothing pain-relief cream (60g) formulated to ease joint discomfort, arthritis and everyday aches.',
    'Wiyun Bee Venom & Turmeric Cream (60g)': 'Joint and bone pain-relief cream (60g) blending turmeric and bee venom extracts — fast-absorbing and fragrance-free.',
    'Formula Tongue Cleaner': 'Soft, ergonomic tongue cleaner that lifts bacteria and residue for fresher breath and a healthier, cleaner mouth.',
    'Wireless Handheld Interview Microphone': 'Wireless handheld mic with transmitter, plug-in receiver and echo control — reliable audio for interviews, reporting and live events.'
  };

  function toNumber(txt) { return parseInt(String(txt).replace(/[^\d]/g, ''), 10) || 0; }
  function fmt(n) { return 'UGX ' + n.toLocaleString('en-US'); }

  // ---- state ----
  var cart = [];
  try { cart = JSON.parse(localStorage.getItem('mse_cart') || '[]'); } catch (e) { cart = []; }
  function save() { try { localStorage.setItem('mse_cart', JSON.stringify(cart)); } catch (e) {} }

  var $ = function (id) { return document.getElementById(id); };
  var cartBtn = $('cartBtn'), cartCount = $('cartCount'), overlay = $('cartOverlay'),
      drawer = $('cartDrawer'), cartClose = $('cartClose'), itemsBox = $('cartItems'),
      emptyMsg = $('cartEmpty'), totalEl = $('cartTotal'), checkout = $('cartCheckout');

  function find(name) { for (var i = 0; i < cart.length; i++) if (cart[i].name === name) return cart[i]; return null; }

  function addToCart(name, price, img, qty) {
    var it = find(name);
    if (it) { it.qty += qty; } else { cart.push({ name: name, price: price, img: img, qty: qty }); }
    save(); render(); flash();
  }
  function setQty(name, qty) {
    var it = find(name); if (!it) return;
    it.qty = qty;
    if (it.qty <= 0) cart = cart.filter(function (c) { return c.name !== name; });
    save(); render();
  }

  function flash() {
    cartCount.style.transform = 'scale(1.4)';
    setTimeout(function () { cartCount.style.transform = ''; }, 180);
  }

  function render() {
    var count = 0, total = 0;
    cart.forEach(function (c) { count += c.qty; total += c.qty * c.price; });
    cartCount.textContent = count;
    cartCount.hidden = count === 0;
    totalEl.textContent = fmt(total);

    itemsBox.innerHTML = '';
    emptyMsg.style.display = cart.length ? 'none' : 'flex';
    cart.forEach(function (c) {
      var row = document.createElement('div');
      row.className = 'cart-row';
      row.innerHTML =
        '<img src="' + c.img + '" alt="">' +
        '<div class="cart-row-info">' +
          '<div class="cart-row-name">' + c.name + '</div>' +
          '<div class="cart-row-price">' + fmt(c.price) + '</div>' +
          '<div class="cart-qty">' +
            '<button type="button" data-act="dec">−</button>' +
            '<span>' + c.qty + '</span>' +
            '<button type="button" data-act="inc">+</button>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="cart-remove" data-act="rm">Remove</button>';
      row.querySelector('[data-act="dec"]').onclick = function () { setQty(c.name, c.qty - 1); };
      row.querySelector('[data-act="inc"]').onclick = function () { setQty(c.name, c.qty + 1); };
      row.querySelector('[data-act="rm"]').onclick = function () { setQty(c.name, 0); };
      itemsBox.appendChild(row);
    });
  }

  // ---- drawer open/close ----
  function openCart() { overlay.hidden = false; requestAnimationFrame(function () { overlay.classList.add('open'); drawer.classList.add('open'); }); drawer.setAttribute('aria-hidden', 'false'); }
  function closeCart() { overlay.classList.remove('open'); drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); setTimeout(function () { overlay.hidden = true; }, 300); }
  cartBtn.addEventListener('click', openCart);
  cartClose.addEventListener('click', closeCart);
  overlay.addEventListener('click', closeCart);
  checkout.addEventListener('click', function () {
    if (!cart.length) { alert('Your cart is empty.'); return; }
    var total = cart.reduce(function (s, c) { return s + c.qty * c.price; }, 0);
    alert('Thank you! Order total: ' + fmt(total) + '\n\nCheckout is a demo — connect a payment provider to go live.');
  });

  // ---- quick-view modal ----
  var qvOverlay = $('qvOverlay'), qvModal = $('qvModal'), qvClose = $('qvClose'),
      qvImg = $('qvImg'), qvName = $('qvName'), qvOld = $('qvOld'), qvNew = $('qvNew'),
      qvDesc = $('qvDesc'), qvQtyEl = $('qvQty'), qvMinus = $('qvMinus'), qvPlus = $('qvPlus'), qvAdd = $('qvAdd');
  var qvState = { name: '', price: 0, img: '', qty: 1 };

  function openQuick(data) {
    qvState = { name: data.name, price: data.price, img: data.img, qty: 1 };
    qvImg.src = data.img; qvImg.alt = data.name;
    qvName.textContent = data.name;
    qvOld.textContent = data.old || '';
    qvNew.textContent = fmt(data.price);
    qvDesc.textContent = DESC[data.name] || 'Quality product from MrSqoopExpress.';
    qvQtyEl.textContent = '1';
    qvOverlay.hidden = false;
    requestAnimationFrame(function () { qvOverlay.classList.add('open'); qvModal.classList.add('open'); });
    qvModal.setAttribute('aria-hidden', 'false');
  }
  function closeQuick() { qvOverlay.classList.remove('open'); qvModal.classList.remove('open'); qvModal.setAttribute('aria-hidden', 'true'); setTimeout(function () { qvOverlay.hidden = true; }, 250); }
  qvClose.addEventListener('click', closeQuick);
  qvOverlay.addEventListener('click', closeQuick);
  qvMinus.addEventListener('click', function () { qvState.qty = Math.max(1, qvState.qty - 1); qvQtyEl.textContent = qvState.qty; });
  qvPlus.addEventListener('click', function () { qvState.qty += 1; qvQtyEl.textContent = qvState.qty; });
  qvAdd.addEventListener('click', function () { addToCart(qvState.name, qvState.price, qvState.img, qvState.qty); closeQuick(); openCart(); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeQuick(); closeCart(); }
  });

  // ---- wire up product cards ----
  function cardData(card) {
    var priceEl = card.querySelector('.new-price');
    var oldEl = card.querySelector('.old-price');
    return {
      name: card.querySelector('.product-name').textContent.trim(),
      price: toNumber(priceEl ? priceEl.textContent : '0'),
      old: oldEl ? oldEl.textContent.trim() : '',
      img: card.querySelector('.product-img img').getAttribute('src')
    };
  }

  document.querySelectorAll('.product-card').forEach(function (card) {
    var d = cardData(card);
    // tap image or name -> quick view
    card.querySelector('.product-img').addEventListener('click', function () { openQuick(cardData(card)); });
    card.querySelector('.product-name').addEventListener('click', function () { openQuick(cardData(card)); });
    // inject add-to-cart button
    var btn = document.createElement('button');
    btn.className = 'add-cart';
    btn.type = 'button';
    btn.textContent = 'Add to Cart';
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var cur = cardData(card);
      addToCart(cur.name, cur.price, cur.img, 1);
      openCart();
      btn.textContent = 'Added ✓';
      btn.classList.add('added');
      setTimeout(function () { btn.textContent = 'Add to Cart'; btn.classList.remove('added'); }, 1200);
    });
    card.appendChild(btn);
  });

  render();
})();
