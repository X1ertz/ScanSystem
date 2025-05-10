const express = require('express');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.json());

app.post('/webhook', (req, res) => {
    try {
        const events = req.body.events;

        events.forEach(event => {
            if (event.type === 'join') {
                const groupId = event.source.groupId;
                if (groupId) {
                    console.log(`📦 Bot เข้าร่วมกลุ่ม! Group ID: ${groupId}`);

                } else {
                    console.log("❌ ไม่พบ Group ID");
                }
            }
        });


        res.status(200).json({ status: 'ok' });

    } catch (error) {
        console.log(`⚠️ เกิดข้อผิดพลาด: ${error}`);
        res.status(500).json({ status: 'error' });
    }
});


app.listen(5000, () => {
    console.log('Server running on port 5000');
});