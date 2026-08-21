/**
 * Vitametric — Interfaz de Usuario y Telemetría del Test Celular
 * Controlador visual del wizard, renderizado dinámico y visualizador SVG de homeostasis.
 */

(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', initTestUI);

  function initTestUI() {
    if (!window.VitametricTestEngine) {
      console.warn('VitametricTestEngine no disponible.');
      return;
    }

    const engine = window.VitametricTestEngine.createInstance();
    const axes = window.VitametricTestEngine.AXES;

    // Elementos DOM del Wizard
    const wizardBox = document.getElementById('test-wizard-container');
    const resultsBox = document.getElementById('test-results-container');
    if (!wizardBox || !resultsBox) return;

    const stepCategory = document.getElementById('test-axis-badge');
    const stepLabel = document.getElementById('test-step-label');
    const progressPct = document.getElementById('test-progress-pct');
    const progressBar = document.getElementById('test-progress-bar');
    const qTitle = document.getElementById('test-q-title');
    const qSubtitle = document.getElementById('test-q-subtitle');
    const optionsList = document.getElementById('test-options-list');
    const prevBtn = document.getElementById('test-btn-prev');

    function renderCurrentQuestion() {
      const q = engine.getCurrentQuestion();
      if (!q) return;

      const currentIdx = engine.currentStep;
      const totalQ = engine.getQuestionsCount();
      const progress = engine.getProgressPercentage();
      const currentAxis = axes[q.axis] || { name: q.category, color: 'var(--c-cyan)', icon: '🔬' };

      // Actualizar Header y Progreso
      if (stepCategory) {
        stepCategory.innerHTML = `<span style="margin-right: 6px;">${currentAxis.icon}</span> ${q.category || currentAxis.name}`;
        stepCategory.style.borderColor = currentAxis.color;
        stepCategory.style.color = currentAxis.color;
        stepCategory.style.background = `${currentAxis.color}15`;
      }

      if (stepLabel) {
        stepLabel.textContent = `Dimensión ${currentIdx + 1} de ${totalQ}`;
      }

      if (progressPct) {
        progressPct.textContent = `${progress}% completado`;
      }

      if (progressBar) {
        progressBar.style.width = `${progress}%`;
      }

      // Pregunta y Subtítulo
      if (qTitle) {
        qTitle.textContent = q.title;
      }

      if (qSubtitle) {
        qSubtitle.textContent = q.subtitle || '';
      }

      // Render de Opciones con Accesibilidad ARIA
      if (optionsList) {
        optionsList.innerHTML = '';
        optionsList.setAttribute('role', 'radiogroup');
        optionsList.setAttribute('aria-labelledby', 'test-q-title');

        const currentAnswer = engine.answers[q.id];
        const selectedIndex = currentAnswer ? currentAnswer.optionIndex : null;

        q.options.forEach((opt, idx) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'test-option-btn';
          btn.setAttribute('role', 'radio');
          btn.setAttribute('aria-checked', selectedIndex === idx ? 'true' : 'false');
          
          const isSelected = selectedIndex === idx;

          btn.style.cssText = `
            display: flex;
            align-items: flex-start;
            gap: 1rem;
            padding: 1.1rem 1.3rem;
            background: ${isSelected ? 'rgba(0, 200, 255, 0.12)' : 'var(--c-bg-mid)'};
            border: 1.5px solid ${isSelected ? 'var(--c-cyan)' : 'var(--c-border)'};
            border-radius: 8px;
            color: var(--c-heading);
            text-align: left;
            font-size: 0.98rem;
            line-height: 1.45;
            cursor: pointer;
            transition: all 0.2s ease;
            font-family: var(--font);
            width: 100%;
            box-sizing: border-box;
          `;

          const radioCircle = document.createElement('span');
          radioCircle.setAttribute('aria-hidden', 'true');
          radioCircle.style.cssText = `
            flex-shrink: 0;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            border: 2px solid ${isSelected ? 'var(--c-cyan)' : 'var(--c-muted)'};
            background: ${isSelected ? 'var(--c-cyan)' : 'transparent'};
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: 2px;
            transition: all 0.2s ease;
          `;

          if (isSelected) {
            radioCircle.innerHTML = `<span style="width: 6px; height: 6px; border-radius: 50%; background: #0A0F1D;"></span>`;
          }

          const textSpan = document.createElement('span');
          textSpan.style.cssText = `
            flex-grow: 1;
            font-weight: ${isSelected ? '600' : '400'};
            color: ${isSelected ? 'var(--c-heading)' : 'var(--c-text)'};
          `;
          textSpan.textContent = opt.text;

          btn.appendChild(radioCircle);
          btn.appendChild(textSpan);

          btn.onmouseover = () => {
            if (!isSelected) {
              btn.style.borderColor = 'var(--c-cyan)';
              btn.style.background = 'rgba(0, 200, 255, 0.06)';
            }
          };

          btn.onmouseout = () => {
            if (!isSelected) {
              btn.style.borderColor = 'var(--c-border)';
              btn.style.background = 'var(--c-bg-mid)';
            }
          };

          btn.onclick = () => {
            engine.answerQuestion(q.id, idx);
            if (engine.isFinished()) {
              renderResults(engine.calculateResults());
            } else {
              engine.next();
              renderCurrentQuestion();
            }
          };

          optionsList.appendChild(btn);
        });
      }

      // Control de botón "Anterior"
      if (prevBtn) {
        prevBtn.style.display = currentIdx > 0 ? 'inline-flex' : 'none';
        prevBtn.onclick = () => {
          if (engine.prev()) {
            renderCurrentQuestion();
          }
        };
      }
    }

    /**
     * Renderiza el componente de resultados con el Radar/Barras de Homeostasis
     */
    function renderResults(results) {
      if (!wizardBox || !resultsBox) return;

      wizardBox.style.display = 'none';
      resultsBox.style.display = 'block';

      // Badge y Títulos
      const badge = document.getElementById('result-badge');
      const title = document.getElementById('result-title');
      const desc = document.getElementById('result-desc');
      const insightBox = document.getElementById('result-insight-box');
      const radarContainer = document.getElementById('result-telemetry-container');

      if (badge) {
        badge.textContent = `Veredicto: ${results.riskBadge}`;
        badge.style.background = `${results.riskColor}18`;
        badge.style.color = results.riskColor;
        badge.style.border = `1.5px solid ${results.riskColor}`;
      }

      if (title) {
        title.textContent = results.riskTitle;
      }

      if (desc) {
        desc.textContent = results.riskSummary;
      }

      if (insightBox) {
        insightBox.innerHTML = `
          <div style="font-size: 0.85rem; font-weight: 700; color: var(--c-cyan); text-transform: uppercase; margin-bottom: 0.5rem; letter-spacing: 0.05em;">
            ⚡ Hallazgo Funcional Dominante:
          </div>
          <div style="font-size: 0.95rem; color: var(--c-text); line-height: 1.6;">
            ${results.physiologicalInsight.replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--c-heading);">$1</strong>')}
          </div>
        `;
      }

      // Renderizar Barras Multidimensionales de Telemetría Bioeléctrica
      if (radarContainer) {
        radarContainer.innerHTML = generateTelemetryHtml(results);
      }

      // Actualizar enlace WhatsApp estructurado
      const waBtn = document.getElementById('btn-enviar-wa-test');
      if (waBtn) {
        waBtn.href = engine.generateWhatsAppUrl('Paciente');
      }

      // Enviar evento analítico si Google Tag está activo
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'conversion_test_completed', {
          event_category: 'engagement',
          event_label: results.riskLevel,
          value: results.globalChargeScore
        });
      }

      // Scroll suave hacia los resultados
      const testSection = document.getElementById('test-celular');
      if (testSection) {
        testSection.scrollIntoView({ behavior: 'smooth' });
      }
    }

    /**
     * Genera el HTML de telemetría de los 5 ejes
     */
    function generateTelemetryHtml(results) {
      const items = [
        { key: 'autonomo', score: results.axisScores.autonomo, res: results.axisResilience.autonomo },
        { key: 'sueno', score: results.axisScores.sueno, res: results.axisResilience.sueno },
        { key: 'cardiometabolico', score: results.axisScores.cardiometabolico, res: results.axisResilience.cardiometabolico },
        { key: 'terreno', score: results.axisScores.terreno, res: results.axisResilience.terreno },
        { key: 'ocupacional', score: results.axisScores.ocupacional, res: results.axisResilience.ocupacional }
      ];

      let barsHtml = items.map(item => {
        const ax = axes[item.key];
        const score = item.score;
        let barColor = '#10B981'; // verde
        let statusLabel = 'Estable';
        if (score > 65) {
          barColor = '#EF4444'; // rojo
          statusLabel = 'Sobrecarga Alta';
        } else if (score > 35) {
          barColor = '#F59E0B'; // amarillo
          statusLabel = 'Alerta Funcional';
        }

        return `
          <div style="margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.88rem; margin-bottom: 0.35rem;">
              <span style="color: var(--c-heading); font-weight: 600; display: flex; align-items: center; gap: 6px;">
                <span>${ax.icon}</span> ${ax.name}
              </span>
              <span style="color: ${barColor}; font-weight: 700; font-size: 0.85rem;">
                ${score}% (${statusLabel})
              </span>
            </div>
            <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden; position: relative;">
              <div style="width: ${score}%; height: 100%; background: ${barColor}; border-radius: 4px; transition: width 0.8s ease-in-out;"></div>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div style="background: var(--c-bg-mid); border: 1px solid var(--c-border); border-radius: 8px; padding: 1.5rem; margin: 1.5rem 0; text-align: left;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; border-bottom: 1px solid var(--c-border); padding-bottom: 0.75rem;">
            <span style="font-size: 0.9rem; color: var(--c-cyan); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
              Telemetría de Carga Celular por Ejes
            </span>
            <span style="font-size: 0.85rem; color: var(--c-heading); font-weight: 800; background: rgba(0,200,255,0.1); padding: 0.2rem 0.6rem; border-radius: 4px; border: 1px solid var(--c-cyan);">
              Score Global: ${results.globalChargeScore}/100
            </span>
          </div>
          ${barsHtml}
        </div>
      `;
    }

    // Reiniciar Test
    window.resetTest = function() {
      engine.reset();
      if (resultsBox) resultsBox.style.display = 'none';
      if (wizardBox) wizardBox.style.display = 'block';
      renderCurrentQuestion();
    };

    // Inicialización de la primera pregunta
    renderCurrentQuestion();
  }
})();
