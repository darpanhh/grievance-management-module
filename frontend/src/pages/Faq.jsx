import { Link } from 'react-router-dom';

const faqs = [
  {
    q: 'What is the Grievance Portal?',
    a: 'The IOE Pulchowk Campus Grievance Portal is a digital platform for students and staff to submit campus-related concerns, track their progress, receive official responses from departments, and reach resolution — all in one place.',
  },
  {
    q: 'Who can submit a grievance?',
    a: 'Currently enrolled students and staff members of IOE Pulchowk Campus can submit grievances. You need a registered account to submit, but anyone can track a grievance anonymously using the grievance ID and secret code.',
  },
  {
    q: 'What kind of issues can I report?',
    a: 'Grievances can be submitted across 9 categories covering academic (examination, grading, curriculum), administrative (registration, scholarships), infrastructure (hostel, campus facilities), and other campus-related concerns.',
  },
  {
    q: 'How do I submit a grievance anonymously?',
    a: 'Check the "Submit anonymously" option on the submission form. Your identity is stored internally for audit purposes only — it will never be shown on the grievance detail page or in any API response. You will receive a one-time 8-character secret code to track your grievance.',
  },
  {
    q: 'What is the daily submission limit?',
    a: 'You can submit up to 3 grievances per calendar day. This limit resets at midnight. If you reach the limit, you will see a message asking you to try again the next day.',
  },
  {
    q: 'How do I track a grievance?',
    a: 'Log in to your account and visit your dashboard to see all your submitted grievances. If you submitted anonymously, use the "Track a Grievance" page on the public portal — enter your GMS-ID (e.g., GMS-0007) and the 8-character secret code you received at submission.',
  },
  {
    q: 'What do the different statuses mean?',
    a: (
      <ul>
        <li><strong>Submitted</strong> — Your grievance has been received and is awaiting review.</li>
        <li><strong>Spam</strong> — Flagged as potential spam by our AI filter. An admin will review it.</li>
        <li><strong>Under Review</strong> — The assigned department is actively looking into your grievance.</li>
        <li><strong>Responded</strong> — The department has posted an official response for you.</li>
        <li><strong>Reopened</strong> — You have requested further review. The department will respond again.</li>
        <li><strong>Escalated</strong> — Automatically escalated to Campus Administration after 72 hours of inactivity.</li>
        <li><strong>Resolved</strong> — You have marked the grievance as resolved.</li>
        <li><strong>Closed</strong> — The grievance is closed and no longer active.</li>
      </ul>
    ),
  },
  {
    q: 'How do I respond to a department response?',
    a: 'If you are satisfied with the department\'s response, use the "Resolve" button to mark the grievance as resolved. If you need further action, use the "Request Further Review" button to reopen it — this restarts the 72-hour timeline for a new response.',
  },
  {
    q: 'What happens if a grievance is not resolved in time?',
    a: 'If a grievance remains in "Under Review", "Responded", or "Reopened" status without any update for 72 hours, it is automatically escalated to Campus Administration for resolution.',
  },
  {
    q: 'What if my grievance is flagged as spam?',
    a: 'You can appeal the spam classification from the grievance detail page. A Campus Admin will review your appeal and either reinstate the grievance or confirm the spam classification.',
  },
  {
    q: 'Can I attach files to my grievance?',
    a: 'Yes. You can attach up to 3 files, each up to 5 MB. Supported formats: PDF, Word documents (.doc, .docx), images (.png, .jpg, .jpeg), and Excel files (.xls, .xlsx).',
  },
  {
    q: 'Who can see my grievance?',
    a: 'Your grievance is visible to: you (the submitter), the HOD and staff of the assigned department, and Campus Administrators. If submitted anonymously, your identity is hidden from the department staff and HOD.',
  },
  {
    q: 'What should I do if I forgot my secret code?',
    a: 'The secret code is shown only once at the time of anonymous submission. If you lose it, contact Campus Administration through the support team to verify your identity and retrieve your grievance.',
  },
  {
    q: 'I need help that is not covered here. What should I do?',
    a: 'Please contact the Campus Administration office at Pulchowk Campus for assistance with any issues not covered on this portal.',
  },
];

const Faq = () => (
  <section className="dashboard-page">
    <div className="dashboard-container">
      <div className="page-heading" style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <span>Help Center</span>
        <h1>Frequently Asked Questions</h1>
        <p>Common questions about using the IOE Pulchowk Grievance Portal.</p>
      </div>

      <div className="faq-list">
        {faqs.map((item, i) => (
          <details key={i} className="faq-item">
            <summary className="faq-question">
              <span className="faq-number">{String(i + 1).padStart(2, '0')}</span>
              {item.q}
            </summary>
            <div className="faq-answer">{item.a}</div>
          </details>
        ))}
      </div>

      <div style={{ textAlign: 'center', marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid var(--border-color)' }}>
        <Link to="/" className="btn btn-primary">Go to Home</Link>
      </div>
    </div>
  </section>
);

export default Faq;
