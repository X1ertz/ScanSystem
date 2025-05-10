const { createServer } = require('http');
const Busboy = require('busboy');
const axios = require('axios');
const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const bodyParser = require('body-parser');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

// === LINE CONFIG ===
const LINE_CHANNEL_ACCESS_TOKEN = 'Jo9wYcVsjfKzgtluTXOu0b+9rYFvRQxpZ/p1VIo9rPVl8Ye3AVjJiOLhft/Zn20XOrAowuatvk5Eql/1oEkG2u3gJXjQnj1zyJvhgEg+dj1S7RmU+UicN5GR3NiFknCcQYNKbMal7aj1Fgrfavu2pAdB0>
const LINE_USER_ID = [
'Ce717eec93652110497b6914234d844ab',
  'C8ba68e5f846b26d0c61770f9d30b404b'
];

// === DB CONFIG ===
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'scan_events.sqlite',
});

const ScanEvent = sequelize.define('ScanEvent', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: DataTypes.STRING,
  employeeId: DataTypes.STRING,
  label: DataTypes.STRING,
  time: DataTypes.STRING,
});

// === LINE PUSH FUNCTION ===
const sendToLine = async (message) => {
  const lineUrl = "https://api.line.me/v2/bot/message/push";
  for (let userId of LINE_USER_ID) {
    try {
      await axios.post(lineUrl, {
        to: userId,
        messages: [{ type: 'text', text: message }]
    }, {
        headers: {
          'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      console.log(`Message sent to ${userId}`);
    } catch (err) {
      console.error(`Failed to send message to ${userId}:`, err.message);
    }
  }
};

// === MAIN SERVER FOR POST EVENT ===
const mainServer = createServer((req, res) => {
  if (req.method === 'POST') {
    const busboy = new Busboy({ headers: req.headers });

    busboy.on('field', async (fieldname, val) => {
      if (fieldname === 'event_log') {
        try {
          const data = JSON.parse(val);
          const event = data.AccessControllerEvent || {};

          const name = event.name || '';
          const empId = event.employeeNoString || '';
          const label = event.label || '';
          const time = data.dateTime || '';

          // Format time using dayjs
          const formattedTime = dayjs(time).tz("Asia/Bangkok").format('MMMM D, YYYY h:mm A');

          if (name && empId && label && time) {
            const message = ` ^=^s  New Scan Person\n ^=^q  Name: ${name}\n ^=^f^t Employee ID: ${empId}\n ^=^s^l Status: ${label}\n ^=^u^r Time: ${formattedTime}`;
            await sendToLine(message);

            // Save event to database
            await ScanEvent.create({ name, employeeId: empId, label, time: formattedTime });
            console.log('Event saved to database');
          }
        } catch (err) {
          console.error('Failed to parse event_log:', err.message);
        }
    }
  });

  busboy.on('finish', () => {
    res.writeHead(200, { 'Connection': 'close' });
    res.end("OK");
  });

  req.pipe(busboy);
} else {
  res.writeHead(405);
  res.end();
}
});

// === EXPRESS WEB REPORT ON SAME PORT ===
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.get('/report', async (req, res) => {
try {
  const data = await ScanEvent.findAll({ order: [['createdAt', 'DESC']] });
  let html = `
    <html>
      <head>
        <meta charset="utf-8">
        <title>Scan Report</title>
        <style>
          body { font-family: sans-serif; margin: 2em; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background-color: #f4f4f4; }
          button { padding: 5px 10px; background: red; color: white; border: none; cursor: pointer; }
        </style>
        <script>
          async function deleteRecord(id) {
            if (confirm('Are you sure you want to delete this record?')) {
              await fetch('/delete/' + id, { method: 'DELETE' });
              location.reload();
            }
          }
        </script>
      </head>
 <body>
          <h2>Scan Report</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Employee ID</th>
                <th>Status</th>
                <th>Time</th>
                <th>Recorded At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
    `;

    data.forEach((event, idx) => {
   const formattedTime = event.time ? dayjs(event.time).format('MMMM D, YYYY h:mm A') : 'N/A';

      html += `
        <tr>
          <td>${event.id}</td>
          <td>${event.name}</td>
          <td>${event.employeeId}</td>
          <td>${event.label}</td>
          <td>${formattedTime}</td>
          <td>${event.createdAt.toLocaleString()}</td>
          <td><button onclick="deleteRecord(${event.id})">Delete</button></td>
        </tr>`;
    });

    html += `
            </tbody>
          </table>
        </body>
      </html>
    `;
    res.send(html);
  } catch (err) {
    res.status(500).send('Failed to load report: ' + err.message);
  }
});
// === DELETE ROUTE ===
app.delete('/delete/:id', async (req, res) => {
    try {
      const id = req.params.id;
      await ScanEvent.destroy({ where: { id } });
      res.sendStatus(200);
    } catch (err) {
      res.status(500).send('Failed to delete: ' + err.message);
    }
  });
  
  // === MERGE HTTP + EXPRESS ===
  const finalServer = createServer((req, res) => {
     if (req.url.startsWith('/report') || req.url.startsWith('/delete')) {
      app(req, res);
    } else {
      mainServer.emit('request', req, res);
    }
  });
  
  // === START SERVER ===
  finalServer.listen(3000, async () => {
    try {
      await sequelize.sync({force:true});
      console.log('Listening for scan events and web reports at:');
      console.log('   POST events: http://0.0.0.0:3000/');
      console.log('   Web report:  http://0.0.0.0:3000/report');
    } catch (err) {
      console.error('Failed to start:', err.message);
    }
  });
  