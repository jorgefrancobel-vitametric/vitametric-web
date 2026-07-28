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
    navToggle.addEventListener('click', () => {
      const isOpen = navMenu.classList.toggle('open');
      navToggle.classList.toggle('active');
      navToggle.setAttribute('aria-expanded', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });
    navLinks.forEach((link) => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('open');
        navToggle.classList.remove('active');
        navToggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      });
    });
    document.addEventListener('click', (e) => {
      if (!navMenu.contains(e.target) && !navToggle.contains(e.target)) {
        navMenu.classList.remove('open');
        navToggle.classList.remove('active');
        navToggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navMenu.classList.contains('open')) {
        navMenu.classList.remove('open');
        navToggle.classList.remove('active');
        navToggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      }
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

  function setupContactForm() {
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
        formError.style.display = 'flex';
        formError.querySelector('p').innerHTML = '<strong>Verificación pendiente.</strong><br>Por favor completa el captcha de seguridad.';
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
            if (typeof turnstile !== 'undefined') turnstile.reset();
          });
        } else {
          formError.style.display = 'flex';
          formError.querySelector('p').innerHTML = '<strong>Verificación fallida.</strong><br>Intenta de nuevo o escríbenos a <a href="mailto:jorge.franco@vitametric.com">jorge.franco@vitametric.com</a>';
          if (btnText) btnText.style.display = 'inline';
          if (btnLoading) btnLoading.style.display = 'none';
          submitBtn.disabled = false;
          if (typeof turnstile !== 'undefined') turnstile.reset();
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
    const connectionDistance = 90;
    const speedFactor = 0.25;

    class Particle {
      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * speedFactor;
        this.vy = (Math.random() - 0.5) * speedFactor;
        this.radius = Math.random() * 1.5 + 1;
        this.color = Math.random() > 0.5 ? 'rgba(0, 200, 255, 0.35)' : 'rgba(0, 255, 157, 0.35)';
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > width) this.vx = -this.vx;
        if (this.y < 0 || this.y > height) this.vy = -this.vy;
      }

      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
      }
    }

    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }

    var rafId;
    var isVisible = true;

    function animate() {
      if (!isVisible) return;
      ctx.clearRect(0, 0, width, height);

      particles.forEach(function (p) {
        p.update();
        p.draw();
      });

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const p1 = particles[i];
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < connectionDistance) {
            const alpha = (1 - dist / connectionDistance) * 0.08;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = 'rgba(0, 200, 255, ' + alpha + ')';
            ctx.lineWidth = 0.5;
            ctx.stroke();
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

  function throttle(fn, wait) {
    var last = 0;
    return function () {
      var now = Date.now();
      if (now - last >= wait) { last = now; fn.apply(this, arguments); }
    };
  }

  function init() {
    window.addEventListener('scroll', throttle(handleNavScroll, 16), { passive: true });
    setupActiveNavObserver();
    setupMobileMenu();
    setupRevealObserver();
    setupTestimonialSlider();
    setupFormValidation();
    setupContactForm();
    setupSmoothScroll();
    setupHeroParticles();
    setupCounters();
    handleNavScroll();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
  else { init(); }
})();
