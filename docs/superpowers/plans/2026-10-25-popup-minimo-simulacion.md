# Interfaz mínima y simulación histórica — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** Reducir el popup a tres acciones principales y permitir una simulación con datos históricos, sin compras.

**Architecture:** Conservar los procesos existentes de sincronización, validación y diagnóstico. Simplificar solo sus controles visibles; añadir una ruta separada de simulación que no produzca borradores aprobables ni copias presentadas como vigentes.

**Tech Stack:** JavaScript de extensión Brave Manifest V3, pruebas Node.

**Spec:** Aprobación conversacional del 25-10-2026: tres botones principales, ajustes avanzados plegados, historial y comprobaciones integrados en estado, simulación no operativa.

## Global Constraints

- Sin ejecutar compras, modificar formularios ni enviar órdenes a Actinver.
- Modo normal conserva límite de 15 minutos y cartera de 35 minutos.
- Simulación histórica marcada inequívocamente como no vigente.
- No exponer tokens ni datos privados en repositorio público.
- Documentar versión y pruebas en GitHub.
- El actualizador Windows existente permanece manual y reutilizable.

## Review Focus

- Cotización antigua: solo la simulación acepta el dato y muestra su antigüedad.
- Cotización actual: modo operativo conserva validaciones.
- Cartera ausente: no inventar títulos o efectivo.
- Propuesta simulada: no puede aprobarse/copiarse como orden vigente.
- Usuario con tokens guardados: simplificación no borra configuración ni rompe sincronización.

---

### Task 1: Popup mínimo

**Files:** `browser/brave-extension/popup.html`, `browser/brave-extension/popup.js`, `tests/test_popup_progress.js`.

**Interfaces:** `run`, `orderPreview`, `orderApprove`; estados existentes siguen consumiendo los mensajes internos.

- [ ] Añadir prueba de tres acciones principales, controles redundantes fuera de la vista diaria y valores de estado presentes.
- [ ] Ejecutar prueba; observar fallo.
- [ ] Modificar marcado y eventos: sincronización; propuestas; preparar datos (visible solo si hay selección); ajustes plegados. Retirar controles redundantes sin romper sus procesos internos.
- [ ] Verificar pruebas del popup y regresiones de sincronización.
- [ ] Commit.

### Task 2: Simulación de datos históricos

**Files:** `browser/brave-extension/order-preflight.js`, `browser/brave-extension/popup.js`, `browser/brave-extension/popup.html`, `tests/test_order_preflight.js`, `tests/test_order_copy_only.js`.

**Interfaces:** `orderDrafts(..., options)` con bandera `simulation_only`; resultado rotulado `HISTORICAL_SIMULATION`, jamás aprobable como borrador vigente.

- [ ] Probar que las cotizaciones antiguas solo generan simulación, que la ausencia de cartera bloquea cantidades y que la aprobación de simulaciones falla.
- [ ] Ejecutar y observar fallo.
- [ ] Implementar modo de simulación desacoplado de la ruta normal, mostrando fecha de la cotización y bloqueo de aprobación/copia operativa.
- [ ] Correr pruebas de regresión completas y validación de empaquetado.
- [ ] Commit y documentar versión y resultados reales.
