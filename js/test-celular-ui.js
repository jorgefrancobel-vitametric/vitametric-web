/**
 * Vitametric — Interfaz de Usuario y Telemetría del Test Celular
 * Controlador visual del wizard con matriz de micro-chips ortogonales,
 * navegación manual explícita por el usuario, accesibilidad ARIA,
 * persistencia resiliente y telemetría bioeléctrica.
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

    // Intentar restaurar sesión previa si existe
    engine.loadFromStorage();

    // Elementos DOM del Wizard
    const wizardBox = document.getElementById('test-wizard-container');
    const resultsBox = document.getElementById('test-results-container');
    if (!wizardBox || !resultsBox) return;

    wizardBox.setAttribute('aria-live', 'polite');

    const stepCategory = document.getElementById('test-axis-badge');
    const stepLabel = document.getElementById('test-step-label');
    const progressPct = document.getElementById('test-progress-pct');
    const progressBar = document.getElementById('test-progress-bar');
    const qTitle = document.getElementById('test-q-title');
    const qSubtitle = document.getElementById('test-q-subtitle');
    const optionsList = document.getElementById('test-options-list');
    const prevBtn = document.getElementById('test-btn-prev');

    // Botón Siguiente / Continuar manual explícito
    let nextBtn = document.getElementById('test-btn-next');
    if (!nextBtn) {
      const navContainer = prevBtn ? prevBtn.parentElement : wizardBox;
      nextBtn = document.createElement('button');
      nextBtn.id = 'test-btn-next';
      nextBtn.type = 'button';
      nextBtn.className = 'btn btn-primary';
      nextBtn.style.cssText = 'padding: 0.6rem 1.5rem; font-size: 0.92rem; margin-left: auto; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; font-weight: 700; border-radius: 6px; transition: all 0.2s ease;';
      nextBtn.innerHTML = 'Continuar <span>→</span>';
      if (navContainer) {
        navContainer.style.display = 'flex';
        navContainer.style.justifyContent = 'space-between';
        navContainer.style.alignItems = 'center';
        navContainer.appendChild(nextBtn);
      }
    }

    function renderCurrentQuestion() {
      const dim = engine.getCurrentQuestion();
      if (!dim) return;

      const currentIdx = engine.currentStep;
      const totalDims = engine.getQuestionsCount();
      const progress = engine.getProgressPercentage();
      const currentAxis = axes[dim.axis] || { name: dim.category, color: 'var(--c-cyan)', icon: '🔬' };

      // Actualizar Header y Barra de Progreso
      if (stepCategory) {
        stepCategory.innerHTML = `<span style="margin-right: 6px;" aria-hidden="true">${currentAxis.icon}</span> ${dim.category || currentAxis.name}`;
        stepCategory.style.borderColor = currentAxis.color;
        stepCategory.style.color = currentAxis.color;
        stepCategory.style.background = `${currentAxis.color}15`;
      }

      if (stepLabel) {
        stepLabel.textContent = `Dimensión ${currentIdx + 1} de ${totalDims}`;
      }

      if (progressPct) {
        progressPct.textContent = `${progress}% completado`;
      }

      if (progressBar) {
        progressBar.style.width = `${progress}%`;
      }

      // Título y Subtítulo Fisiológico
      if (qTitle) {
        qTitle.textContent = dim.title;
      }

      if (qSubtitle) {
        qSubtitle.textContent = dim.subtitle || '';
      }

      // Estado guardado para esta dimensión (si el usuario ya había seleccionado algo antes)
      const existingAnswer = engine.answers[dim.id];
      let selectedIds = existingAnswer ? [...(existingAnswer.selectedItemIds || [])] : [];
      let isOptimalSelected = existingAnswer ? !!existingAnswer.isOptimal : false;

      function updateNextButtonState() {
        if (!nextBtn) return;
        const hasSelection = isOptimalSelected || selectedIds.length > 0;
        nextBtn.disabled = !hasSelection;
        nextBtn.style.opacity = hasSelection ? '1' : '0.4';
        nextBtn.style.cursor = hasSelection ? 'pointer' : 'not-allowed';
        nextBtn.innerHTML = (currentIdx === totalDims - 1) ? 'Ver resultados <span>→</span>' : 'Continuar <span>→</span>';
      }

      // Renderizar Matriz de Micro-Chips
      if (optionsList) {
        optionsList.innerHTML = '';
        optionsList.setAttribute('role', 'group');
        optionsList.setAttribute('aria-label', dim.title);

        const chipsGrid = document.createElement('div');
        chipsGrid.style.cssText = `
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1rem;
        `;

        // 1. Renderizar Micro-Chips de Síntomas
        dim.items.forEach(it => {
          const isSelected = selectedIds.includes(it.id);

          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'test-chip-btn';
          chip.setAttribute('role', 'checkbox');
          chip.setAttribute('aria-checked', isSelected ? 'true' : 'false');

          chip.style.cssText = `
            display: flex;
            align-items: flex-start;
            gap: 0.85rem;
            padding: 0.9rem 1.15rem;
            background: ${isSelected ? 'rgba(0, 200, 255, 0.12)' : 'var(--c-bg-mid)'};
            border: 1.5px solid ${isSelected ? 'var(--c-cyan)' : 'var(--c-border)'};
            border-radius: 8px;
            color: var(--c-heading);
            text-align: left;
            font-size: 0.95rem;
            line-height: 1.45;
            cursor: pointer;
            transition: all 0.2s ease;
            font-family: var(--font);
            width: 100%;
            box-sizing: border-box;
          `;

          const boxSpan = document.createElement('span');
          boxSpan.setAttribute('aria-hidden', 'true');
          boxSpan.style.cssText = `
            flex-shrink: 0;
            width: 18px;
            height: 18px;
            border-radius: 4px;
            border: 1.5px solid ${isSelected ? 'var(--c-cyan)' : 'var(--c-muted)'};
            background: ${isSelected ? 'var(--c-cyan)' : 'transparent'};
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: 2px;
            font-size: 11px;
            color: #0A0F1D;
            font-weight: 900;
            transition: all 0.2s ease;
          `;
          if (isSelected) {
            boxSpan.textContent = '✓';
          }

          const textSpan = document.createElement('span');
          textSpan.style.cssText = `
            flex-grow: 1;
            font-weight: ${isSelected ? '600' : '400'};
            color: ${isSelected ? 'var(--c-heading)' : 'var(--c-text)'};
          `;
          textSpan.textContent = it.text;

          chip.appendChild(boxSpan);
          chip.appendChild(textSpan);

          chip.onclick = () => {
            isOptimalSelected = false;
            if (selectedIds.includes(it.id)) {
              selectedIds = selectedIds.filter(id => id !== it.id);
            } else {
              selectedIds.push(it.id);
            }

            if (selectedIds.length > 0) {
              engine.answerDimension(dim.id, selectedIds, false);
            } else {
              delete engine.answers[dim.id];
              engine.saveToStorage();
            }
            renderCurrentQuestion();
          };

          chipsGrid.appendChild(chip);
        });

        // 2. Renderizar Opción "Estado Óptimo / Sin Síntomas"
        if (dim.optimalOption) {
          const optChip = document.createElement('button');
          optChip.type = 'button';
          optChip.className = 'test-chip-optimal-btn';
          optChip.setAttribute('role', 'checkbox');
          optChip.setAttribute('aria-checked', isOptimalSelected ? 'true' : 'false');

          optChip.style.cssText = `
            display: flex;
            align-items: flex-start;
            gap: 0.85rem;
            padding: 0.9rem 1.15rem;
            background: ${isOptimalSelected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.02)'};
            border: 1.5px solid ${isOptimalSelected ? '#10B981' : 'var(--c-border)'};
            border-radius: 8px;
            color: ${isOptimalSelected ? 'var(--c-heading)' : 'var(--c-muted)'};
            text-align: left;
            font-size: 0.92rem;
            line-height: 1.45;
            cursor: pointer;
            transition: all 0.2s ease;
            font-family: var(--font);
            width: 100%;
            box-sizing: border-box;
            margin-top: 0.5rem;
          `;

          const radioCircle = document.createElement('span');
          radioCircle.setAttribute('aria-hidden', 'true');
          radioCircle.style.cssText = `
            flex-shrink: 0;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            border: 1.5px solid ${isOptimalSelected ? '#10B981' : 'var(--c-muted)'};
            background: ${isOptimalSelected ? '#10B981' : 'transparent'};
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: 2px;
            transition: all 0.2s ease;
          `;
          if (isOptimalSelected) {
            radioCircle.innerHTML = '<span style="width: 6px; height: 6px; border-radius: 50%; background: #0A0F1D;"></span>';
          }

          const optTextSpan = document.createElement('span');
          optTextSpan.style.cssText = `
            flex-grow: 1;
            font-weight: ${isOptimalSelected ? '600' : '400'};
            color: ${isOptimalSelected ? '#10B981' : 'var(--c-muted)'};
          `;
          optTextSpan.textContent = `🟢 ${dim.optimalOption.text}`;

          optChip.appendChild(radioCircle);
          optChip.appendChild(optTextSpan);

          optChip.onclick = () => {
            if (isOptimalSelected) {
              isOptimalSelected = false;
              delete engine.answers[dim.id];
              engine.saveToStorage();
            } else {
              isOptimalSelected = true;
              selectedIds = [];
              engine.answerDimension(dim.id, [], true);
            }
            renderCurrentQuestion();
          };

          chipsGrid.appendChild(optChip);
        }

        optionsList.appendChild(chipsGrid);
      }

      updateNextButtonState();

      // Botón "Continuar / Ver resultados" manual explícito
      if (nextBtn) {
        nextBtn.onclick = () => {
          if (!engine.canGoNext()) return;
          if (engine.isFinished()) {
            renderResults(engine.calculateResults());
          } else {
            engine.next();
            renderCurrentQuestion();
          }
        };
      }

      // Botón "Anterior"
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
     * Renderiza el informe y telemetría de resultados
     */
    function renderResults(results) {
      if (!wizardBox || !resultsBox) return;

      wizardBox.style.display = 'none';
      resultsBox.style.display = 'block';

      const badge = document.getElementById('result-badge');
      const title = document.getElementById('result-title');
      const desc = document.getElementById('result-desc');
      const insightBox = document.getElementById('result-insight-box');
      const telemetryContainer = document.getElementById('result-telemetry-container');

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
      if (telemetryContainer) {
        telemetryContainer.innerHTML = generateTelemetryHtml(results);
      }

      // Actualizar enlace WhatsApp con telemetría preformateada
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
                <span aria-hidden="true">${ax.icon}</span> ${ax.name}
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
      engine.clearStorage();
      if (resultsBox) resultsBox.style.display = 'none';
      if (wizardBox) wizardBox.style.display = 'block';
      renderCurrentQuestion();
    };

    // Inicialización del wizard
    renderCurrentQuestion();
  }
})();
