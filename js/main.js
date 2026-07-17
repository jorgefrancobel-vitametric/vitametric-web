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
              link.classList.toggle('active', link.getAttribute('href') === '#' + id);
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

    function goToSlide(index) {
      currentSlide = ((index % slideCount) + slideCount) % slideCount;
      testimonialTrack.style.transform = 'translateX(-' + (currentSlide * 100) + '%)';
      dots.forEach(function (dot, i) { dot.classList.toggle('active', i === currentSlide); });
    }
    function nextSlide() { goToSlide(currentSlide + 1); }
    function prevSlide() { goToSlide(currentSlide - 1); }
    function startAutoSlide() { autoSlideInterval = setInterval(nextSlide, 5000); }
    function resetAutoSlide() { clearInterval(autoSlideInterval); startAutoSlide(); }

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
    startAutoSlide();
  }

  function setupContactForm() {
    if (!contactForm) return;
    var workerUrl = 'https://turnstile-siteverify-vitametric.elnoruegosh.workers.dev';

    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (submitBtn && submitBtn.disabled) return;
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
    const particleCount = 60; // Keep it optimal for performance
    const connectionDistance = 110;
    const speedFactor = 0.4;

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

    function animate() {
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
            const alpha = (1 - dist / connectionDistance) * 0.12;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = 'rgba(0, 200, 255, ' + alpha + ')';
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      requestAnimationFrame(animate);
    }

    animate();
  }

  function setupCounters() {
    const counters = document.querySelectorAll('.counter-number');
    if (counters.length === 0) return;

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
    setupContactForm();
    setupSmoothScroll();
    setupHeroParticles();
    setupCounters();
    handleNavScroll();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
  else { init(); }
})();
