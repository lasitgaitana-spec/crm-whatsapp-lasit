# Guía de Contribución

¡Gracias por tu interés en contribuir al CRM WhatsApp del Colegio Lasit! 🎉

Este documento te guiará sobre cómo puedes ayudar a mejorar el proyecto.

## ¿Cómo puedo ayudar?

### Reportar errores (Bugs)
Si encuentras un error, por favor crea un **Issue** en GitHub detallando:
1. Qué estabas haciendo.
2. Qué esperabas que pasara.
3. Qué pasó realmente (incluye capturas de pantalla si es posible).

### Sugerir nuevas funcionalidades
Si tienes una idea para mejorar el CRM, abre un **Issue** con la etiqueta `enhancement` explicando tu propuesta.

### Contribuir con código
1.  **Elige una tarea**: Busca en los [Issues](https://github.com/lasitgaitana-spec/crm-whatsapp-lasit/issues) tareas con la etiqueta `help wanted` o `good first issue`.
2.  **Haz un Fork**: Crea una copia del repositorio en tu cuenta.
3.  **Crea una rama (Branch)**:
    ```bash
    git checkout -b feature/mi-nueva-funcionalidad
    # o
    git checkout -b fix/arreglo-bug
    ```
4.  **Haz tus cambios**: Asegúrate de seguir el estilo de código existente.
5.  **Commit y Push**:
    ```bash
    git commit -m "Descripción clara de mis cambios"
    git push origin feature/mi-nueva-funcionalidad
    ```
6.  **Abre un Pull Request (PR)**: Envía tu solicitud para que revisemos tus cambios.

## Estándares de Código

- **Frontend**: Usamos React con Vite. Intenta mantener los componentes pequeños y reutilizables.
- **Backend**: Node.js con Express. Mantén la lógica de negocio separada de las rutas.
- **Commits**: Usa mensajes claros (ej. "Agregar botón de exportar" en lugar de "cambios").

## ¿Necesitas ayuda?
Si tienes dudas sobre cómo implementar algo, pregunta en los comentarios del Issue correspondiente. ¡Estamos aquí para aprender juntos!
