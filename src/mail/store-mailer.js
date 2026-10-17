function createStoreMailer(nodemailer, env = process.env, isAdminEmail = () => false) {
    const address = env.STORE_EMAIL || env.GMAIL_USER;
    // Keep credentials paired: a new store account must supply its own app password.
    const password = env.STORE_EMAIL ? env.STORE_EMAIL_APP_PASSWORD : env.GMAIL_APP_PASSWORD;
    const options = { host: 'smtp.gmail.com', connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, auth: { user: address, pass: password } };
    const transport = nodemailer.createTransport({ ...options, port: 465, secure: true });
    let fallback;
    const alternate = () => fallback ||= nodemailer.createTransport({ ...options, port: 587, secure: false, requireTLS: true });
    const connectionFailure = error => ['ESOCKET', 'ECONNECTION', 'ETIMEDOUT', 'EDNS'].includes(error.code) && error.command === 'CONN';
    function checkSender() {
        if (typeof address !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || !password || isAdminEmail(address)) {
            const error = new Error('Configure a dedicated store Gmail account and its app password.');
            error.code = 'ESTORESENDER'; throw error;
        }
    }
    return {
        address,
        async verify() {
            checkSender();
            try { return await transport.verify(); }
            catch (error) { if (!connectionFailure(error)) throw error; return alternate().verify(); }
        },
        async sendMail(message) {
            checkSender();
            // Every route uses the same authenticated mailbox; route-level From/Sender
            // overrides cannot reveal an administrator's account identity.
            const { from, sender, envelope, ...content } = message;
            const mail = { ...content, from: { name: 'HongKong Supermarket', address }, sender: address };
            try { return await transport.sendMail(mail); }
            catch (error) {
                // Retry only failed connection establishment, before SMTP can accept the message.
                if (!connectionFailure(error)) throw error;
                return alternate().sendMail(mail);
            }
        }
    };
}
module.exports = { createStoreMailer };
