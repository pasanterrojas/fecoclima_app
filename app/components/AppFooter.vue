<template>
    <footer class="footer">
        <div class="container">
            <div class="footer-row">
                <span>Uso orientativo · Valide decisiones fitosanitarias con un profesional.</span>
                <NuxtLink to="/fecoclima-ia">Política de privacidad</NuxtLink>
                <span>FECOCLIMA IA © 2026</span>
            </div>
            <div class="developer-credit">
                Desarrollado con 💻 y ☕ por Reymond E. Rojas Núñez || IICA PDTAF
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