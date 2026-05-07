# Sistema de Reserva de Demostración VR - README

Esta carpeta contiene el sistema temporal de reserva de demostración de VR 

## Ubicación
- URL: `https://intellisalud.com/vrdemo.html`
- Archivos: carpeta `vr-demo/` (separada del sitio principal)

## Archivos
- `vrdemo.html` - Página principal de reserva (EN ESPAÑOL)
- `vrdemo-styles.css` - Estilos
- `vrdemo-script.js` - Lógica de JavaScript (EMAILS EN ESPAÑOL)
- `README.md` - Este archivo

## Características
✓ Código QR para que los usuarios escaneen y reserven
✓ Formulario de reserva simple (nombre, teléfono, correo, cuestionario de salud)
✓ Verificación de edad (mínimo 13 años, consentimiento de padres para menores de 18)
✓ Exención de responsabilidad
✓ Confirmaciones automáticas por correo (Formspree)
✓ Integración con Google Calendar
✓ Vista de calendario de franjas horarias disponibles
✓ Diseño responsive para dispositivos móviles
✓ **TODO EN ESPAÑOL**

## Configuración

### Confirmaciones de Correo (Formspree)
1. Ve a https://formspree.io/
2. Regístrate (cuenta gratuita)
3. Crea un nuevo formulario
4. Copia tu **ID de Formulario** (formato: `f/xxxxx`)
5. En `vrdemo-script.js`, encuentra esta línea:
```javascript
   const formspreeEndpoint = 'https://formspree.io/f/YOUR_FORM_ID';
```
6. Reemplaza `YOUR_FORM_ID` con tu ID de formulario de Formspree
7. Guarda y despliega

### Google Calendar
El formulario de reserva abre automáticamente Google Calendar para que los usuarios agreguen el evento a su calendario.

## Cómo Eliminar Después del Día de Demostración

### Opción 1: Eliminar vía Interfaz Web de GitHub
1. Ve a tu repositorio de GitHub
2. Navega a la carpeta `vr-demo`
3. Haz clic en el botón "Eliminar" (menú de tres puntos)
4. Confirma la eliminación
5. Cloudflare se desplegará automáticamente

### Opción 2: Eliminar vía Línea de Comandos
```bash
cd intellisalud-website
rm -rf vr-demo/
git add -A
git commit -m "Eliminar sistema de reserva de demostración VR"
git push origin main
```

### Verifica que se Eliminó
- Verifica GitHub (la carpeta debería estar desaparecida)
- Visita `https://intellisalud.com/vrdemo.html` (debería mostrar 404)

## Notas Importantes
- Este sistema usa `localStorage` del navegador - no requiere base de datos
- Todas las reservas se almacenan localmente en el navegador de cada usuario
- No se almacenan datos sensibles en servidores
- Es seguro eliminar por completo después de la demostración

## Solución de Problemas

### ¿El código QR no se genera?
- Verifica la consola del navegador (F12)
- Asegúrate de que la biblioteca qrcodejs se carga desde el CDN

### ¿Los correos no se envían?
- Verifica que el punto final de Formspree sea correcto
- Revisa la carpeta de spam
- Asegúrate de que el ID de formulario sea correcto

### ¿Las reservas no aparecen?
- Verifica que localStorage esté habilitado
- Abre DevTools > Application > Storage > Local Storage
- Verifica que la URL sea `intellisalud.com/vrdemo.html`

## Archivos no Afectados
Tus archivos del sitio principal en la carpeta `public/` están completamente intactos y seguros.

