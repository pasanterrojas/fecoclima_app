<script setup lang="ts">
const { zoneLabel } = useViewerTime()
</script>

<template>
    <footer class="footer">
        <div class="container">
            <div class="footer-row">
                <span>Uso orientativo · Valide decisiones fitosanitarias con un profesional.</span>
                <NuxtLink to="/fecoclima-ia">Política de privacidad</NuxtLink>
                <span>FECOCLIMA IA © 2026</span>
            </div>
            <p class="footer-time-zone">{{ zoneLabel }} <InfoHint text="Las horas se convierten a la zona de su dispositivo. La lectura original, su antigüedad y las ventanas de análisis no cambian. La fecha de siembra y los días de pronóstico conservan su fecha de calendario." /></p>
            <div class="developer-credit">
                Desarrollado con 💻 y ☕ por Reymond E. Rojas Núñez || Cooperación Técnica del IICA
            </div>
        </div>
    </footer>
</template>

<style scoped>
    .footer {
        background: var(--fc-secondary);
        color: #fff;
        padding-bottom: 12px; /* Añadido un poco de espacio inferior para la nueva línea */
    }

    .footer-row {
        min-height: 54px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        font-size: .88rem;
    }

    .footer-time-zone{display:flex;align-items:center;gap:5px;margin:4px 0;font-size:.73rem;color:#e4eef5}

    .developer-credit {
        text-align: right;
        font-size: 0.75rem;
        opacity: 0.85; /* Un poco de transparencia para no restar protagonismo a los enlaces principales */
        margin-top: 4px;
    }

    @media(max-width: 720px) {
        .footer-row {
            padding: 15px 0 5px 0;
            align-items: flex-start;
            flex-direction: column;
            gap: 8px;
        }
        
        .developer-credit {
            text-align: left; /* Alineación a la izquierda en móvil para mantener la lectura natural en columna */
            margin-top: 12px;
        }
    }
</style>