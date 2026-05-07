// Tab Switching
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('active');
    });
    
    document.querySelectorAll('.tab-btn').forEach(el => {
        el.classList.remove('active');
    });
    
    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    generateQRCode();
    generateCalendar();
    loadBookings();
});

// Generate QR Code
function generateQRCode() {
    const qrContainer = document.getElementById('qrcode');
    if (qrContainer) {
        new QRCode(qrContainer, {
            text: window.location.href,
            width: 200,
            height: 200,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });
    }
}

// Generate Calendar
function generateCalendar() {
    const calendarGrid = document.getElementById('calendarGrid');
    const today = new Date();
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        
        const dayCard = createDayCard(date);
        calendarGrid.appendChild(dayCard);
    }
}

// Create Day Card
function createDayCard(date) {
    const dayCard = document.createElement('div');
    dayCard.className = 'day-card';
    
    // Spanish day and date format
    const dayName = date.toLocaleDateString('es-ES', { weekday: 'long' });
    const dateStr = date.toLocaleDateString('es-ES', { month: 'long', day: 'numeric', year: 'numeric' });
    
    const header = document.createElement('div');
    header.className = 'day-header';
    header.textContent = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)}, ${dateStr}`;
    
    dayCard.appendChild(header);
    
    const timeSlots = [
        '09:00', '09:20', '09:40', '10:00', '10:20', '14:00', '14:20', '15:00', '15:20'
    ];
    
    const bookedSlots = getBookedSlots(date);
    
    timeSlots.forEach(time => {
        const slot = document.createElement('div');
        slot.className = 'time-slot';
        
        const [hours, minutes] = time.split(':');
        const endTime = getEndTime(time);
        
        slot.textContent = `${formatTime(hours, minutes)} - ${endTime}`;
        
        if (bookedSlots.includes(time)) {
            slot.classList.add('booked');
        } else {
            slot.classList.add('available');
            slot.onclick = () => selectTimeSlot(date, time);
        }
        
        dayCard.appendChild(slot);
    });
    
    return dayCard;
}

function getEndTime(time) {
    const [hours, minutes] = time.split(':').map(Number);
    const endMinutes = minutes + 20;
    const endHours = hours + Math.floor(endMinutes / 60);
    const finalMinutes = endMinutes % 60;
    return formatTime(String(endHours), String(finalMinutes).padStart(2, '0'));
}

function formatTime(hours, minutes) {
    const h = parseInt(hours);
    const m = parseInt(minutes).toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHours = h % 12 || 12;
    return `${displayHours}:${m} ${ampm}`;
}

function selectTimeSlot(date, time) {
    const dateStr = date.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
    document.getElementById('date').value = dateStr.split('/').reverse().join('-');
    document.getElementById('time').value = time;
    
    document.querySelector('.booking-section').scrollIntoView({ behavior: 'smooth' });
}

// Form Submission
document.getElementById('bookingForm')?.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const age = parseInt(document.getElementById('age').value);
    if (age < 13) {
        alert('Debes tener al menos 13 años para participar.');
        return;
    }
    
    if (age < 18 && !document.getElementById('parentConsent').checked) {
        alert('Se requiere consentimiento de los padres para menores de 18 años.');
        return;
    }
    
    if (!document.getElementById('agreeWaiver').checked) {
        alert('Debes aceptar la exención de responsabilidad para continuar.');
        return;
    }
    
    const booking = {
        id: Date.now(),
        name: document.getElementById('name').value,
        phone: document.getElementById('phone').value,
        email: document.getElementById('email').value,
        date: document.getElementById('date').value,
        time: document.getElementById('time').value,
        health: document.getElementById('health').value || 'Ninguna',
        age: age,
        timestamp: new Date().toISOString()
    };
    
    saveBooking(booking);
    sendBookingEmail(booking);
    addToGoogleCalendar(booking);
    
    alert(`¡Reserva confirmada! Se ha enviado un correo de confirmación a ${booking.email}`);
    
    this.reset();
    loadBookings();
    
    document.getElementById('bookings').classList.add('active');
    document.querySelectorAll('.tab-btn')[2].classList.add('active');
    document.getElementById('qr').classList.remove('active');
    document.querySelectorAll('.tab-btn')[0].classList.remove('active');
});

// Save Booking to localStorage
function saveBooking(booking) {
    let bookings = JSON.parse(localStorage.getItem('vrBookings') || '[]');
    bookings.push(booking);
    localStorage.setItem('vrBookings', JSON.stringify(bookings));
    
    const dateStr = booking.date;
    let bookedSlots = JSON.parse(localStorage.getItem(`bookedSlots_${dateStr}`) || '[]');
    bookedSlots.push(booking.time);
    localStorage.setItem(`bookedSlots_${dateStr}`, JSON.stringify(bookedSlots));
}

// Get Booked Slots for a Date
function getBookedSlots(date) {
    const dateStr = date.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');
    return JSON.parse(localStorage.getItem(`bookedSlots_${dateStr}`) || '[]');
}

// Load and Display Bookings
function loadBookings() {
    const bookingsList = document.getElementById('bookingsList');
    const bookings = JSON.parse(localStorage.getItem('vrBookings') || '[]');
    
    if (bookings.length === 0) {
        bookingsList.innerHTML = '<p class="empty-message">Sin reservas aún. ¡Reserva tu sesión usando el formulario anterior!</p>';
        return;
    }
    
    bookingsList.innerHTML = '';
    
    bookings.forEach(booking => {
        const item = document.createElement('div');
        item.className = 'booking-item';
        
        const dateObj = new Date(booking.date + 'T00:00:00');
        const formattedDate = dateObj.toLocaleDateString('es-ES', { 
            weekday: 'long', 
            month: 'long', 
            day: 'numeric',
            year: 'numeric'
        });
        
        const [hours, minutes] = booking.time.split(':').map(Number);
        const endMinutes = minutes + 20;
        const endHours = hours + Math.floor(endMinutes / 60);
        const finalMinutes = endMinutes % 60;
        
        const startTime = formatTime(String(hours), String(minutes).padStart(2, '0'));
        const endTime = formatTime(String(endHours), String(finalMinutes).padStart(2, '0'));
        
        item.innerHTML = `
            <div class="booking-item-header">${booking.name}</div>
            <div class="booking-item-detail"><strong>Fecha y Hora:</strong> ${formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1)} • ${startTime} - ${endTime}</div>
            <div class="booking-item-detail"><strong>Teléfono:</strong> ${booking.phone}</div>
            <div class="booking-item-detail"><strong>Correo Electrónico:</strong> ${booking.email}</div>
            <div class="booking-item-detail"><strong>Edad:</strong> ${booking.age}</div>
            <div class="booking-item-detail"><strong>Preocupaciones de Salud:</strong> ${booking.health}</div>
        `;
        
        bookingsList.appendChild(item);
    });
}

// Send Email via Formspree (Free Service) - SPANISH VERSION
function sendBookingEmail(booking) {
    // IMPORTANTE: Reemplaza con tu ID de formulario de Formspree
    // Obtenlo en: https://formspree.io/
    const formspreeEndpoint = 'https://formspree.io/f/YOUR_FORM_ID';
    
    // Format date in Spanish
    const dateObj = new Date(booking.date + 'T00:00:00');
    const formattedDate = dateObj.toLocaleDateString('es-ES', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric',
        year: 'numeric'
    });
    
    const [hours, minutes] = booking.time.split(':').map(Number);
    const endMinutes = minutes + 20;
    const endHours = hours + Math.floor(endMinutes / 60);
    const finalMinutes = endMinutes % 60;
    
    const startTime = formatTime(String(hours), String(minutes).padStart(2, '0'));
    const endTime = formatTime(String(endHours), String(finalMinutes).padStart(2, '0'));
    
    // Spanish email content
    const emailContent = `
CONFIRMACIÓN DE RESERVA - DEMOSTRACIÓN VR

¡Hola ${booking.name}!

Tu reserva para la demostración de Realidad Virtual ha sido confirmada exitosamente.

DETALLES DE LA RESERVA:
═══════════════════════════════════════════════════════════════════════
Nombre: ${booking.name}
Fecha: ${formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1)}
Hora: ${startTime} - ${endTime}
Duración: 20 minutos
Teléfono: ${booking.phone}
Edad: ${booking.age} años

CONDICIONES DE SALUD:
${booking.health}

═══════════════════════════════════════════════════════════════════════

INSTRUCCIONES IMPORTANTES:
- Por favor llega 5 minutos antes de tu hora de reserva
- Se requiere consentimiento de padres/tutores para menores de 18 años
- Retira objetos de bolsillos y quítate el reloj antes de la sesión
- Sigue todas las instrucciones de seguridad del operador
- Aclara cualquier pregunta sobre tus condiciones de salud

UBICACIÓN:
IntelliSalud - Estación de Demostración VR
[Dirección a completar]

Si necesitas cambiar o cancelar tu reserva, por favor responde a este correo lo antes posible.

¡Esperamos tu participación!

Saludos,
Equipo IntelliSalud
    `.trim();
    
    const emailData = {
        name: booking.name,
        email: booking.email,
        subject: `Confirmación de Reserva VR - ${formattedDate}`,
        message: emailContent
    };
    
    fetch(formspreeEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailData)
    }).then(response => {
        if (response.ok) {
            console.log('Correo enviado exitosamente');
        }
    }).catch(error => console.error('Error al enviar correo:', error));
}

// Add to Google Calendar
function addToGoogleCalendar(booking) {
    const [year, month, day] = booking.date.split('-');
    const [hours, minutes] = booking.time.split(':');
    const endTime = new Date(year, month - 1, day, parseInt(hours) + 0, parseInt(minutes) + 20);
    
    const startDateTime = `${year}${month}${day}T${hours}${minutes}00`;
    const endDateTime = `${endTime.getFullYear()}${String(endTime.getMonth() + 1).padStart(2, '0')}${String(endTime.getDate()).padStart(2, '0')}T${String(endTime.getHours()).padStart(2, '0')}${String(endTime.getMinutes()).padStart(2, '0')}00`;
    
    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=Demostraci%C3%B3n%20VR:%20${encodeURIComponent(booking.name)}&dates=${startDateTime}/${endDateTime}&details=${encodeURIComponent('Condiciones de salud: ' + booking.health)}&location=IntelliSalud%20Estudio%20VR`;
    
    window.open(googleCalendarUrl, '_blank');
}
