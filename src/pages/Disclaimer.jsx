import { motion } from "framer-motion";
import { AlertCircle, Scale, Eye, DollarSign, Shield, Navigation } from "lucide-react";

export default function Disclaimer() {
  const sections = [
    {
      icon: Scale,
      title: "Terms of Service",
      content: "By using Linked, you agree to these terms. Users must be 18+ to create accounts. Contractors and customers are responsible for accurate information provided. We reserve the right to suspend accounts that violate our policies.",
    },
    {
      icon: Eye,
      title: "Privacy & Data",
      content: "We collect the email address, phone number, service address, and payment information you provide, in order to operate the platform. Your data is never sold. Contractors' and customers' contact details are shared only to facilitate job bookings — a provider deciding whether to accept an open job sees only the general area (city, state, and ZIP), not your exact address or contact details, until they have accepted it.",
    },
    {
      // Phase 3 added provider location tracking, so the disclosure has to
      // describe what the code actually does. Every claim below maps to a
      // specific enforced behaviour: updateProviderLocation refuses to write
      // outside the on_the_way/arriving states and to anyone but the assigned
      // provider; updateBookingStatus nulls the coordinates on
      // completion/cancellation; and src/lib/tracking.js throttles the
      // capture rate. Do not soften or extend these sentences without
      // changing the corresponding code.
      icon: Navigation,
      title: "Location Tracking",
      content: "Location is used for two things. First, to show you jobs or providers near you — this uses a one-off location reading, or a ZIP code you type in, and is not stored. Second, when a provider is travelling to an accepted job, their device shares its position with that job's customer so you can see how far away they are. Provider location sharing starts only when the provider marks themselves on the way, is visible only to the customer on that specific job, and stops when the job is completed or cancelled — at which point the stored coordinates are deleted. We do not collect location in the background when the app is closed, we do not keep a location history, and we never share a provider's location with other customers or providers. Location sharing can be declined; the job can still be completed without it.",
    },
    {
      icon: DollarSign,
      title: "Payment & Dispute Resolution",
      content: "Payments are processed through Base44 Payments (formerly Wix Payments). Contractors accept full responsibility for work quality. Disputes must be reported within 14 days of job completion. Refunds are processed after verification of non-completion or unsatisfactory service.",
    },
    {
      icon: Shield,
      title: "Liability & Indemnification",
      content: "Linked is a technology platform and marketplace that connects homeowners, realtors, and business owners with independent contractors and handymen. Linked does not employ contractors, supervise work, guarantee workmanship, or act as a party to any agreement between users and contractors. We are not liable for any injuries, property damage, financial loss, disputes, or claims arising from interactions or transactions between users on this platform. All parties agree to indemnify and hold harmless Linked, its owners, developers, and operators from any and all claims, damages, or liabilities arising from the use of this platform or the services rendered through it.",
    },
    {
      icon: AlertCircle,
      title: "Contractor Requirements",
      content: "Contractors must maintain accurate profiles and respond to accepted jobs. Failure to show up or communicate may result in account suspension. Contractors and handymen are independent contractors, not employees of Linked. Linked does not withhold taxes, provide benefits, or control how work is performed. Contractors are solely responsible for their own licensing, insurance, tax obligations, and compliance with applicable laws.",
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-24 md:pb-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        {/* Header */}
        <div>
          <h1 className="font-heading font-extrabold text-3xl md:text-4xl text-foreground mb-2">
            Legal Disclaimer
          </h1>
          <p className="text-muted-foreground text-base">
            Important information about using Linked and our terms of service
          </p>
        </div>

        {/* Warning Banner */}
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 flex gap-4">
          <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900 dark:text-amber-100 text-sm mb-1">
              Please Read Carefully
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-200">
              By using Linked, you accept all terms, conditions, and disclaimers outlined below. If you disagree, do not use the platform.
            </p>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-4">
          {sections.map((section, i) => {
            const Icon = section.icon;
            return (
              <motion.div
                key={section.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * i }}
                className="bg-card rounded-2xl border border-border p-6 hover:border-primary/30 transition-colors"
              >
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h2 className="font-heading font-bold text-foreground mb-2">
                      {section.title}
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {section.content}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Additional Legal */}
        <div className="bg-secondary/50 rounded-2xl border border-border p-6 space-y-4">
          <h3 className="font-heading font-bold text-foreground">
            Additional Important Information
          </h3>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Verification:</strong> Providers may submit license and business details for review, and a Verified badge reflects that review. Linked does not employ, supervise, background-check, or insure providers, and does not guarantee quality of work or a provider&apos;s qualifications. Always request references and read reviews before booking.
            </p>
            <p>
              <strong className="text-foreground">Insurance:</strong> Providers are solely responsible for obtaining liability and workers&apos; compensation insurance. Linked does not verify insurance and provides no coverage.
            </p>
            <p>
              <strong className="text-foreground">Modifications:</strong> We may update these terms at any time. Continued use constitutes acceptance of changes.
            </p>
            <p>
              <strong className="text-foreground">Platform Role:</strong> Linked acts solely as a neutral marketplace. Any agreement, contract, or arrangement for services is strictly between the user and the contractor. Linked is not a party to these agreements and bears no responsibility for their outcome.
            </p>
            <p>
              <strong className="text-foreground">Support:</strong> For legal inquiries or disputes, contact us at support@linked.app.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground border-t border-border pt-6">
          <p>Last Updated: May 2026</p>
          <p>© 2026 Linked. All rights reserved.</p>
        </div>
      </motion.div>
    </div>
  );
}