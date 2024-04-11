const express = require('express');
const path = require('path');
const WooCommerceAPI = require('woocommerce-api');
const pdf = require('html-pdf');
const fs = require('fs');

const app = express();

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

const WooCommerce = new WooCommerceAPI({
  url: 'https://staging2.vaseegrahveda.com/',
  consumerKey: 'ck_1cfb0c2ac1ce87466afd68488ad8b790239ebc2c',
  consumerSecret: 'cs_63b22c257d43ef3ee8d6d6747ab80ede38013f61',
  wpAPI: true,
  version: 'wc/v3'
});

const getOrderDetails = (orderId) => {
  return new Promise((resolve, reject) => {
    WooCommerce.get(`orders/${orderId}`, function (err, data, res) {
      if (err) {
        reject(err);
      } else {
        const order = JSON.parse(data.body);
        resolve(order);
      }
    });
  });
};

// Function to add a note to the customer's order notes only if it doesn't already exist
async function addCustomerOrderNoteIfNotExists(orderId, note) {
  try {
    const existingNotes = await getOrderNotes(orderId);
    const noteExists = existingNotes.some(existingNote => existingNote.content === note);
    if (noteExists) {
      const confirmed = await confirmNoteResend();
      if (!confirmed) {
        return 'Note already exists. Not sending again.';
      }
    }
    await addCustomerOrderNote(orderId, note);
    return 'Note added successfully';
  } catch (error) {
    console.error('Error adding customer order note:', error);
    throw error; // re-throw the error for higher level handling
  }
}

// Function to get existing notes for a specific order
async function getOrderNotes(orderId) {
  return new Promise((resolve, reject) => {
    WooCommerce.get(`orders/${orderId}/notes`, function (err, data, res) {
      if (err) {
        reject(err);
      } else {
        resolve(JSON.parse(data.body));
      }
    });
  });
}

// Function to add a note to the customer's order notes
async function addCustomerOrderNote(orderId, note) {
  return new Promise((resolve, reject) => {
    WooCommerce.post(`orders/${orderId}/notes`, { note: note, customer_note: true }, function (err, data, res) {
      if (err) {
        console.error('Error adding note to order:', err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Function to prompt the user for confirmation
function confirmNoteResend() {
  return new Promise((resolve, reject) => {
    const confirmed = confirm("Note already exists. Do you want to send it again?");
    resolve(confirmed);
  });
}

// Generate PDF document
app.get('/generate-pdf/:orderId', async (req, res) => {
  const orderId = req.params.orderId;
  try {
    const order = await getOrderDetails(orderId);

    // HTML content to convert to PDF
    const htmlContent = `
    <html>
    <head>
      <title>Order Details</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          width: 4in;
          height: 4in;
        }
    
        .content {
          width: 4in;
          height: 4in;
          background-color: white;
          border: 3px solid black;
          padding: 5px;
          font-size: 12px; /* Adjust font size as needed */
        }
    
        .content p {
          font-size: 12px;
        }
    
        .content table {
          width: 100%;
          font-size: 12px;
          border-collapse: collapse;
        }
    
        .content table th,
        .content table td {
          border: 1px solid #ddd;
          padding: 8px;
          text-align: left;
        }
    
        .content table th {
          background-color: #f2f2f2;
        }
      </style>
    </head>
    <body>
      <div class="content">
        <h3>Ship Via: ST COURIER</h3>
        <h2 style="text-align: center;">Vaseegrah Veda Order ID ${order.id}</h2>
        <table>
          <tr>
            <td style="font-size: 14px; padding: 8px; text-align: center;">To</td>
            <td>
              ${order.billing.first_name} ${order.billing.last_name},<br>
              ${order.billing.phone}<br>
              ${order.shipping.address_1},<br> 
              ${order.shipping.city},<br>
              ${order.shipping.state}, ${order.shipping.postcode}.<br>
              ${order.shipping.country}<br>
              ${order.billing.phone}
            </td>
          </tr>
        </table>
    
        <table>
          <tbody>
            <tr>
              <td>
                <b>Seller:</b><br>
                <b>VASEEGRAH VEDA</b><br>
                No:7 VIJAYA NAGAR,<br>
                SRINIVASAPURAM (Post)<br>
                THANJAVUR<br>
                TAMIL NADU- 613009<br>
                MOBILE: 8248817165
              </td>
              <td>
                <b>Prepaid Order:</b><br>
                Date: ${order.date_created}<br>
                Weight: ${order.total_weight}<br>
                No.of Items: ${order.line_items.length}<br>
                Packed By: None
              </td>
            </tr>
            <tr>
              <td colspan='2'>
                <strong>Products:</strong><br>
                ${order.line_items.map((item) => `&nbsp;${item.name} X ${item.quantity},`).join("")}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </body>
    </html>
    
      `;

    // Options for PDF generation
    const options = {
      // PDF generation options
      width: 4 * 61, // 4 inches * 72 points per inch
      height: 4 * 61,
    };

    // Convert HTML to PDF
    pdf.create(htmlContent, options).toStream((err, stream) => {
      if (err) {
        console.error(err);
        res.status(500).send('Error generating PDF');
      } else {
        // Set response headers for PDF file
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename = "order_${orderId}.pdf"`);

        // Pipe PDF stream to response
        stream.pipe(res);
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error generating PDF');
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/order-details/:orderId', async (req, res) => {
  const orderId = req.params.orderId;
  try {
    const order = await getOrderDetails(orderId);
    res.send(order);
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).send('Error fetching order details');
  }
});

app.get('/check-customer-notes/:orderId', async (req, res) => {
  const orderId = req.params.orderId;
  try {
    const existingNotes = await getOrderNotes(orderId);
    const containsText = existingNotes.some(note => note && note.content && note.content.includes('Your order is printed shipping label is sent to the packing department'));
    res.json({ notesExist: existingNotes.length > 0, containsText });
  } catch (error) {
    console.error('Error checking customer notes:', error);
    res.status(500).json({ error: 'Error checking customer notes' });
  }
});


app.get('/update-order-notes/:orderId', async (req, res) => {
  const orderId = req.params.orderId;
  try {
    const order = await getOrderDetails(orderId);
    if (order.status === 'processing') {
      const note = 'Your order is printed shipping label is sent to the packing department';
      const result = await addCustomerOrderNoteIfNotExists(orderId, note);
      res.send(result);
    } else {
      res.status(400).send('Order is not in processing state');
    }
  } catch (error) {
    console.error('Error updating order notes:', error);
    res.status(500).send('Error updating order notes. Please try again.');
  }
});

const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
