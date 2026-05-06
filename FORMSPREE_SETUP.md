# Contact Form Setup (Email Delivery)

To receive contact form submissions at **ggiri@caldwell.edu**, use [Formspree](https://formspree.io):

1. Go to [formspree.io](https://formspree.io) and sign up (free).
2. Create a new form.
3. Set the notification email to **ggiri@caldwell.edu**.
4. Verify your email when prompted.
5. Copy your form ID (e.g. `xyzdabc` from the URL `https://formspree.io/f/xyzdabc`).
6. Open `script.js` and replace `YOUR_FORMSPREE_ID` with your form ID:

   ```javascript
   const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xyzdabc';  // use your ID
   ```

7. Save and redeploy. Each submission will be emailed to ggiri@caldwell.edu.

**Rate limit:** One submission per 10 minutes per browser (stored in localStorage).
