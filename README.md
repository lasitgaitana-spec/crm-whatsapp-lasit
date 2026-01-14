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

## Instalación y ejecución

El proyecto está dividido en dos partes principales: **Frontend** (React) y **Backend** (Node.js).

### 1. Backend (API y WhatsApp)

1.  Entra a la carpeta del servidor:
    ```bash
    cd server
    ```
2.  Instala las dependencias:
    ```bash
    npm install
    ```
3.  Configura las variables de entorno:
    - Crea un archivo `.env` basado en `.env.example`.
    - Configura tu conexión a MySQL y las claves de API (Gemini, etc.).
4.  Inicia el servidor en modo desarrollo:
    ```bash
    npm run dev
    ```

### 2. Frontend (Interfaz Web)

1.  Entra a la carpeta del frontend:
    ```bash
    cd frontend
    ```
2.  Instala las dependencias:
    ```bash
    npm install
    ```
3.  Inicia el servidor de desarrollo:
    ```bash
    npm run dev
    ```

## Contribución

¡Queremos tu ayuda para mejorar este CRM! 

Por favor lee el archivo [CONTRIBUTING.md](CONTRIBUTING.md) para detalles sobre nuestro código de conducta y el proceso para enviarnos Pull Requests.

### ¿Por dónde empezar?
Busca en la pestaña **Issues** de GitHub etiquetas como:
- `good first issue`: Tareas ideales para quienes contribuyen por primera vez.
- `help wanted`: Tareas donde necesitamos ayuda extra.
