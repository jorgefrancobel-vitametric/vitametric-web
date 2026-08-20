/* VITAMETRIC — Main JavaScript */
(function () {
  'use strict';

  const navbar = document.getElementById('navbar');
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');
  const navLinks = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('section[id]');
  const reveals = document.querySelectorAll('.reveal');
  const testimonialTrack = document.getElementById('testimonialTrack');
  const testimonialDots = document.getElementById('testimonialDots');
  const prevBtn = document.getElementById('prevTestimonial');
  const nextBtn = document.getElementById('nextTestimonial');
  const contactForm = document.getElementById('contactForm');
  const submitBtn = document.getElementById('submitBtn');
  const formSuccess = document.getElementById('formSuccess');
  const formError = document.getElementById('formError');

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var validateAllFields;

  function handleNavScroll() {
    if (!navbar) return;
    if (window.scrollY > 50) { navbar.classList.add('scrolled'); }
    else { navbar.classList.remove('scrolled'); }
  }

  function setupActiveNavObserver() {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('id');
            navLinks.forEach((link) => {
              const isActive = link.getAttribute('href') === '#' + id;
              link.classList.toggle('active', isActive);
              if (isActive) link.setAttribute('aria-current', 'page');
              else link.removeAttribute('aria-current');
            });
          }
        });
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 }
    );
    sections.forEach((section) => observer.observe(section));
  }

  function setupMobileMenu() {
    if (!navToggle || !navMenu) return;
    // El drawer cerrado es display:none (ver style.css): asi no ensancha el documento.
    // Por eso el cierre se anima con la clase .closing antes de quitar .open.
    const ANIM_MS = 300;
    let closeTimer = null;

    const isOpen = () => navMenu.classList.contains('open') && !navMenu.classList.contains('closing');

    const open = () => {
      clearTimeout(closeTimer);
      navMenu.classList.remove('closing');
      navMenu.classList.add('open');
      navToggle.classList.add('active');
      navToggle.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    };

    const close = () => {
      if (!navMenu.classList.contains('open')) return;
      navMenu.classList.add('closing');
      navToggle.classList.remove('active');
      navToggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => navMenu.classList.remove('open', 'closing'), ANIM_MS);
    };

    navToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isOpen()) { close(); } else { open(); }
    });
    navLinks.forEach((link) => link.addEventListener('click', close));
    document.addEventListener('click', (e) => {
      if (!navMenu.contains(e.target) && !navToggle.contains(e.target)) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) close();
    });
  }

  function setupRevealObserver() {
    if (prefersReducedMotion) {
      reveals.forEach((el) => el.classList.add('visible'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const delay = parseInt(entry.target.dataset.delay || 0, 10);
            setTimeout(() => entry.target.classList.add('visible'), delay);
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -60px 0px', threshold: 0.1 }
    );
    reveals.forEach((el) => observer.observe(el));
  }

  var currentSlide = 0;
  var slideCount = 0;
  var autoSlideInterval;

  function setupTestimonialSlider() {
    if (!testimonialTrack) return;
    var slides = testimonialTrack.querySelectorAll('.testimonial-slide');
    slideCount = slides.length;
    var dots = testimonialDots.querySelectorAll('.dot');

    function updateDots() {
      dots.forEach(function (dot, i) {
        var isActive = i === currentSlide;
        dot.classList.toggle('active', isActive);
        dot.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
    }

    function goToSlide(index) {
      currentSlide = ((index % slideCount) + slideCount) % slideCount;
      testimonialTrack.style.transform = 'translateX(-' + (currentSlide * 100) + '%)';
      updateDots();
    }
    function nextSlide() { goToSlide(currentSlide + 1); }
    function prevSlide() { goToSlide(currentSlide - 1); }
    function startAutoSlide() { if (prefersReducedMotion) return; autoSlideInterval = setInterval(nextSlide, 5000); }
    function resetAutoSlide() { if (prefersReducedMotion) return; clearInterval(autoSlideInterval); startAutoSlide(); }

    if (nextBtn) nextBtn.addEventListener('click', function () { nextSlide(); resetAutoSlide(); });
    if (prevBtn) prevBtn.addEventListener('click', function () { prevSlide(); resetAutoSlide(); });
    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () { goToSlide(i); resetAutoSlide(); });
    });

    var touchStartX = 0;
    testimonialTrack.addEventListener('touchstart', function (e) { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
    testimonialTrack.addEventListener('touchend', function (e) {
      var diff = touchStartX - e.changedTouches[0].screenX;
      if (Math.abs(diff) > 50) { diff > 0 ? nextSlide() : prevSlide(); resetAutoSlide(); }
    }, { passive: true });

    var sliderContainer = testimonialTrack.parentElement;
    sliderContainer.addEventListener('mouseenter', function () { clearInterval(autoSlideInterval); });
    sliderContainer.addEventListener('mouseleave', function () { resetAutoSlide(); });

    document.addEventListener('keydown', function (e) {
      var tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'ArrowLeft') { prevSlide(); resetAutoSlide(); }
      if (e.key === 'ArrowRight') { nextSlide(); resetAutoSlide(); }
    });

    startAutoSlide();
  }

  function setupFormValidation() {
    if (!contactForm) return;
    var fields = Array.prototype.slice.call(contactForm.querySelectorAll('input:not([name="_gotcha"]), select, textarea'));
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var phoneRegex = /^(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,4}$/;

    function markField(field, valid) {
      field.classList.remove('valid', 'invalid');
      field.classList.add(valid ? 'valid' : 'invalid');
    }

    function validateField(field) {
      var value = field.value.trim();
      var valid = true;
      if (field.type === 'checkbox') {
        if (field.hasAttribute('required') && !field.checked) valid = false;
      } else {
        if (field.hasAttribute('required') && !value) valid = false;
        if (valid && field.type === 'email' && value && !emailRegex.test(value)) valid = false;
        if (valid && field.type === 'tel' && value && !phoneRegex.test(value)) valid = false;
      }
      markField(field, valid);
      return valid;
    }

    validateAllFields = function () {
      var allValid = true;
      fields.forEach(function (field) {
        if (!validateField(field)) allValid = false;
      });
      return allValid;
    };

    fields.forEach(function (field) {
      field.addEventListener('blur', function () { validateField(field); });
      field.addEventListener('input', function () {
        if (field.classList.contains('invalid')) validateField(field);
      });
    });
  }

  function setupTurnstile() {
    var turnstileEl = document.getElementById('contactTurnstile');
    if (!turnstileEl) return function () { return Promise.resolve(); };

    var loadPromise;
    var renderPromise;
    var widgetId = null;

    function loadApi() {
      if (window.turnstile) return Promise.resolve(window.turnstile);
      if (loadPromise) return loadPromise;

      loadPromise = new Promise(function (resolve, reject) {
        var script = document.querySelector('script[data-vitametric-turnstile]') ||
          document.querySelector('script[src*="challenges.cloudflare.com/turnstile/v0/api.js"]');
        var attempts = 0;

        function settleWhenReady() {
          if (window.turnstile) {
            resolve(window.turnstile);
          } else if (attempts++ < 50) {
            window.setTimeout(settleWhenReady, 100);
          } else {
            reject(new Error('Turnstile API did not initialize'));
          }
        }

        function handleError() {
          reject(new Error('Turnstile API failed to load'));
        }

        if (!script) {
          script = document.createElement('script');
          script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
          script.async = true;
          script.defer = true;
          script.dataset.vitametricTurnstile = 'true';
        }
        script.addEventListener('load', settleWhenReady, { once: true });
        script.addEventListener('error', handleError, { once: true });
        if (!script.parentNode) document.head.appendChild(script);
        settleWhenReady();
      });
      loadPromise = loadPromise.catch(function (error) {
        loadPromise = null;
        throw error;
      });
      return loadPromise;
    }

    function render() {
      if (widgetId !== null) return Promise.resolve(widgetId);
      if (renderPromise) return renderPromise;

      renderPromise = loadApi().then(function (api) {
        if (widgetId === null) {
          widgetId = api.render(turnstileEl, {
            sitekey: turnstileEl.dataset.sitekey,
            action: turnstileEl.dataset.action
          });
        }
        return widgetId;
      }).catch(function (error) {
        renderPromise = null;
        throw error;
      });
      return renderPromise;
    }

    var formSection = turnstileEl.closest('form') || turnstileEl;
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            render().catch(function () {});
            observer.disconnect();
          }
        });
      }, { rootMargin: '300px 0px' });
      observer.observe(formSection);
    }
    formSection.addEventListener('focusin', function () { render().catch(function () {}); }, { once: true });

    render.reset = function () {
      if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
    };
    return render;
  }

  function setupContactForm(ensureTurnstile) {
    if (!contactForm) return;
    var workerUrl = 'https://turnstile-siteverify-vitametric.elnoruegosh.workers.dev';

    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (submitBtn && submitBtn.disabled) return;

      if (typeof validateAllFields !== 'function' || !validateAllFields()) {
        formError.style.display = 'flex';
        formError.querySelector('p').innerHTML = '<strong>Campos incompletos.</strong><br>Por favor revisa los campos marcados en rojo.';
        return;
      }

      var tokenEl = document.querySelector('[name="cf-turnstile-response"]');
      if (!tokenEl || !tokenEl.value) {
        ensureTurnstile().then(function () {
          var turnstileEl = document.getElementById('contactTurnstile');
          if (turnstileEl) turnstileEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }).catch(function () {});
        formError.style.display = 'flex';
        formError.querySelector('p').innerHTML = '<strong>Completa la verificación de seguridad.</strong><br>El captcha está listo; después vuelve a pulsar Enviar mensaje.';
        return;
      }

      var btnText = submitBtn.querySelector('.btn-text');
      var btnLoading = submitBtn.querySelector('.btn-loading');
      if (btnText) btnText.style.display = 'none';
      if (btnLoading) btnLoading.style.display = 'inline-flex';
      submitBtn.disabled = true;
      formSuccess.style.display = 'none';
      formError.style.display = 'none';

      fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenEl.value })
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.success) {
          var formData = new FormData(contactForm);
          fetch(contactForm.action, {
            method: 'POST',
            body: formData,
            headers: { 'Accept': 'application/json' }
          })
          .then(function (r) {
            if (r.ok) {
              formSuccess.style.display = 'flex';
              formError.style.display = 'none';
              contactForm.reset();
              contactForm.querySelectorAll('input, select, textarea').forEach(function (el) {
                el.classList.remove('valid', 'invalid');
              });
            } else {
              throw new Error('Formspree status ' + r.status);
            }
          })
          .catch(function () {
            formError.style.display = 'flex';
            formError.querySelector('p').innerHTML = '<strong>Error al enviar.</strong><br>Intenta de nuevo o escríbenos a <a href="mailto:jorge.franco@vitametric.com">jorge.franco@vitametric.com</a>';
          })
          .finally(function () {
            if (btnText) btnText.style.display = 'inline';
            if (btnLoading) btnLoading.style.display = 'none';
            submitBtn.disabled = false;
            if (ensureTurnstile.reset) ensureTurnstile.reset();
          });
        } else {
          formError.style.display = 'flex';
          formError.querySelector('p').innerHTML = '<strong>Verificación fallida.</strong><br>Intenta de nuevo o escríbenos a <a href="mailto:jorge.franco@vitametric.com">jorge.franco@vitametric.com</a>';
          if (btnText) btnText.style.display = 'inline';
          if (btnLoading) btnLoading.style.display = 'none';
          submitBtn.disabled = false;
          if (ensureTurnstile.reset) ensureTurnstile.reset();
        }
      })
      .catch(function () {
        formError.style.display = 'flex';
        formError.querySelector('p').innerHTML = '<strong>Error de conexión.</strong><br>Intenta de nuevo o escríbenos a <a href="mailto:jorge.franco@vitametric.com">jorge.franco@vitametric.com</a>';
        if (btnText) btnText.style.display = 'inline';
        if (btnLoading) btnLoading.style.display = 'none';
        submitBtn.disabled = false;
      });
    });
  }

  function setupHeroParticles() {
    if (prefersReducedMotion) return;
    const canvas = document.getElementById('heroCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let width = canvas.width = canvas.offsetWidth;
    let height = canvas.height = canvas.offsetHeight;

    window.addEventListener('resize', throttle(function() {
      if (canvas.offsetWidth !== width || canvas.offsetHeight !== height) {
        width = canvas.width = canvas.offsetWidth;
        height = canvas.height = canvas.offsetHeight;
      }
    }, 100), { passive: true });

    const particles = [];
    const particleCount = 40; // Reduced for calmer, more clinical feel
    const connectionDistance = 110;
    const speedFactor = 0.25;

    // Colores leídos de las CSS custom properties: se re-evalúan en cada toggle
    // de tema en vez de quedar fijos al valor de cuando cargó la página.
    var themeColors = { cyan: [0, 200, 255], green: [0, 255, 157] };
    function readThemeColors() {
      const cs = getComputedStyle(document.documentElement);
      const parse = (hex) => {
        hex = hex.trim();
        if (hex[0] === '#') {
          const n = parseInt(hex.slice(1), 16);
          return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        }
        return null;
      };
      themeColors.cyan = parse(cs.getPropertyValue('--c-cyan')) || themeColors.cyan;
      themeColors.green = parse(cs.getPropertyValue('--c-green')) || themeColors.green;
    }
    readThemeColors();
    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () { setTimeout(readThemeColors, 0); });
    });

    class Particle {
      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * speedFactor;
        this.vy = (Math.random() - 0.5) * speedFactor;
        this.radius = Math.random() * 1.7 + 1;
        this.hue = Math.random() > 0.5 ? 'cyan' : 'green';
        this.pulseOffset = Math.random() * Math.PI * 2;
      }

      update(t) {
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > width) this.vx = -this.vx;
        if (this.y < 0 || this.y > height) this.vy = -this.vy;
        this.pulse = 0.55 + Math.sin(t / 900 + this.pulseOffset) * 0.35;
      }

      draw() {
        const c = themeColors[this.hue];
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (0.55 * this.pulse) + ')';
        ctx.shadowColor = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.7)';
        ctx.shadowBlur = 6 * this.pulse;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }

    var rafId;
    var isVisible = true;

    // Conexiones como curvas suaves (rizoma: raíces que se arquean al
    // encontrarse), no líneas rectas — el arco se dobla hacia el punto medio
    // desplazado perpendicularmente, proporcional a la distancia.
    function drawConnection(p1, p2, alpha) {
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const bow = Math.min(18, dist * 0.18);
      const cx = mx - (dy / dist) * bow;
      const cy = my + (dx / dist) * bow;
      const c1 = themeColors[p1.hue];
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.quadraticCurveTo(cx, cy, p2.x, p2.y);
      ctx.strokeStyle = 'rgba(' + c1[0] + ',' + c1[1] + ',' + c1[2] + ',' + alpha + ')';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }

    function animate(t) {
      if (!isVisible) return;
      ctx.clearRect(0, 0, width, height);

      particles.forEach(function (p) { p.update(t || 0); p.draw(); });

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const p1 = particles[i];
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < connectionDistance) {
            const alpha = (1 - dist / connectionDistance) * 0.16;
            drawConnection(p1, p2, alpha);
          }
        }
      }

      rafId = requestAnimationFrame(animate);
    }

    var canvasObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        isVisible = entry.isIntersecting;
        if (isVisible && !rafId) {
          rafId = requestAnimationFrame(animate);
        }
      });
    }, { threshold: 0 });

    canvasObserver.observe(canvas);
    rafId = requestAnimationFrame(animate);
  }

  function setupCounters() {
    const counters = document.querySelectorAll('.counter-number');
    if (counters.length === 0) return;

    if (prefersReducedMotion) {
      counters.forEach(function (counter) {
        counter.textContent = counter.getAttribute('data-target') + (counter.getAttribute('data-suffix') || '');
      });
      return;
    }

    const animateCounter = function (counter) {
      const target = parseInt(counter.getAttribute('data-target'), 10);
      const suffix = counter.getAttribute('data-suffix') || '';
      const duration = 2000;
      const startTime = performance.now();

      const updateCount = function (currentTime) {
        const elapsedTime = currentTime - startTime;
        const progress = Math.min(elapsedTime / duration, 1);
        
        const easeProgress = progress * (2 - progress);
        const currentValue = Math.floor(easeProgress * target);

        counter.textContent = currentValue + suffix;

        if (progress < 1) {
          requestAnimationFrame(updateCount);
        } else {
          counter.textContent = target + suffix;
        }
      };

      requestAnimationFrame(updateCount);
    };

    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -50px 0px', threshold: 0.1 });

    counters.forEach(function (counter) { observer.observe(counter); });
  }

  function setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener('click', function (e) {
        var href = anchor.getAttribute('href');
        if (href === '#') return;
        var target = document.querySelector(href);
        if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
      });
    });
  }

  function setupLazyMap() {
    var mapEl = document.getElementById('contactMap');
    if (!mapEl) return;
    var mapSrc = mapEl.getAttribute('data-src');
    if (!mapSrc) return;

    if ('IntersectionObserver' in window) {
      var mapObserver = new IntersectionObserver(function (entries, observer) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            mapEl.setAttribute('src', mapSrc);
            mapEl.removeAttribute('data-src');
            observer.unobserve(mapEl);
          }
        });
      }, { rootMargin: '200px 0px' });
      mapObserver.observe(mapEl);
    } else {
      mapEl.setAttribute('src', mapSrc);
    }
  }

  function throttle(fn, wait) {
    var last = 0;
    return function () {
      var now = Date.now();
      if (now - last >= wait) { last = now; fn.apply(this, arguments); }
    };
  }

  function setupStickyCta() {
    var stickyCta = document.querySelector('.sticky-cta');
    if (!stickyCta) return;
    function checkSticky() {
      if (window.scrollY > 400) { stickyCta.classList.add('visible'); }
      else { stickyCta.classList.remove('visible'); }
    }
    window.addEventListener('scroll', throttle(checkSticky, 100), { passive: true });
    checkSticky();
  }

  function init() {
    window.addEventListener('scroll', throttle(handleNavScroll, 16), { passive: true });
    setupActiveNavObserver();
    setupMobileMenu();
    setupRevealObserver();
    setupTestimonialSlider();
    setupFormValidation();
    var ensureTurnstile = setupTurnstile();
    setupContactForm(ensureTurnstile);
    setupSmoothScroll();
    setupHeroParticles();
    setupCounters();
    setupLazyMap();
    setupStickyCta();
    handleNavScroll();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
  else { init(); }
})();
