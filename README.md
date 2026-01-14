# CRM WhatsApp Colegio Lasit

CRM para atención de clientes por WhatsApp del Colegio Lasit, con recepcionista de inteligencia artificial, gestión de contactos, etiquetas, campañas y automatización de respuestas.

## Características principales

- Recepcionista automático con IA (Gemini) que:
  - Atiende mensajes de WhatsApp en tiempo real.
  - Detecta el nombre del cliente.
  - Identifica el programa de interés (Bachillerato por ciclos, Bachillerato Virtual, Técnico en mecánica y electricidad de motocicletas, Centro de enseñanza automovilística).
  - Guarda automáticamente nombre y programa en contactos con su etiqueta correspondiente.
- Panel web para:
  - Ver conversaciones de WhatsApp (Inbox).
  - Gestionar contactos y etiquetas.
  - Configurar la base de conocimiento del recepcionista.
  - Administrar campañas y envíos masivos.
- Integración con WhatsApp Business (mediante sesión/credenciales locales).
- Backend con base de datos MySQL para almacenar contactos y mensajes.

## Tecnologías

- **Frontend:** React + Vite + Material UI.
- **Backend:** Node.js + Express.
- **Base de datos:** MySQL.
- **IA:** Google Gemini (modelo configurado vía variables de entorno).
- **Otros:** Socket.IO para actualización en tiempo real.

## Requisitos

- Node.js (versión recomendada LTS).
- MySQL en funcionamiento (local o remoto).
- Clave de API de Gemini válida.
- Cuenta/instancia de WhatsApp conectada al sistema.

## Instalación y ejecución (desarrollo)

1. Clonar el repositorio:

   ```bash
   git clone https://github.com/TU_USUARIO/TU_REPO.git
   cd TU_REPO
