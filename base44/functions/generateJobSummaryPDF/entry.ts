import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { jsPDF } from 'npm:jspdf@4.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookingId } = await req.json();
    const booking = await base44.entities.Booking.get(bookingId);

    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Create PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = 20;

    // Header
    doc.setFontSize(24);
    doc.setFont(undefined, 'bold');
    doc.text('Work Summary', pageWidth / 2, yPosition, { align: 'center' });
    
    yPosition += 15;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100);
    doc.text(`Invoice #${booking.id.substring(0, 8).toUpperCase()}`, pageWidth / 2, yPosition, { align: 'center' });

    yPosition += 20;
    
    // Contractor Info
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0);
    doc.text('Contractor:', 20, yPosition);
    
    yPosition += 7;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(booking.contractor_name || 'N/A', 20, yPosition);
    doc.text(booking.contractor_category || '', 20, yPosition + 5);

    // Job Details Section
    yPosition += 25;
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('Job Details:', 20, yPosition);
    
    yPosition += 10;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    
    // Job Title
    doc.setFont(undefined, 'bold');
    doc.text('Title:', 20, yPosition);
    doc.setFont(undefined, 'normal');
    doc.text(booking.job_title || 'N/A', 50, yPosition);
    
    // Date
    yPosition += 8;
    doc.setFont(undefined, 'bold');
    doc.text('Date:', 20, yPosition);
    doc.setFont(undefined, 'normal');
    const dateStr = booking.preferred_date ? new Date(booking.preferred_date).toLocaleDateString() : 'N/A';
    doc.text(dateStr, 50, yPosition);
    
    // Time
    yPosition += 8;
    doc.setFont(undefined, 'bold');
    doc.text('Time:', 20, yPosition);
    doc.setFont(undefined, 'normal');
    doc.text(booking.preferred_time || 'N/A', 50, yPosition);
    
    // Location
    yPosition += 8;
    doc.setFont(undefined, 'bold');
    doc.text('Location:', 20, yPosition);
    doc.setFont(undefined, 'normal');
    const address = booking.address ? `${booking.address}, ${booking.city}, ${booking.state} ${booking.zip}` : 'N/A';
    doc.text(address, 50, yPosition, { maxWidth: 140 });

    // Description Section
    if (booking.job_description) {
      yPosition += 20;
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.text('Work Performed:', 20, yPosition);
      
      yPosition += 8;
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      const splitDesc = doc.splitTextToSize(booking.job_description, 170);
      doc.text(splitDesc, 20, yPosition);
      yPosition += splitDesc.length * 5 + 5;
    }

    // Payment Section
    yPosition = Math.max(yPosition + 15, pageHeight - 80);
    
    doc.setDrawColor(200);
    doc.line(20, yPosition, pageWidth - 20, yPosition);
    
    yPosition += 10;
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('Payment Summary:', 20, yPosition);
    
    yPosition += 10;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    
    // Hours
    doc.text('Estimated Hours:', 20, yPosition);
    doc.setFont(undefined, 'bold');
    doc.text(`${booking.estimated_hours} hours`, 110, yPosition);
    
    // Cost
    yPosition += 10;
    doc.setFont(undefined, 'normal');
    doc.text('Total Amount:', 20, yPosition);
    doc.setFont(undefined, 'bold');
    doc.text(`$${booking.estimated_cost}`, 110, yPosition);

    // Footer
    yPosition = pageHeight - 15;
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(150);
    doc.text(`Generated on ${new Date().toLocaleDateString()}`, pageWidth / 2, yPosition, { align: 'center' });

    // Generate PDF and save to private storage
    const pdfBytes = doc.output('arraybuffer');
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    
    // Upload to private storage
    const uploadRes = await base44.asServiceRole.integrations.Core.UploadPrivateFile({
      file: Buffer.from(await pdfBlob.arrayBuffer()),
    });

    return Response.json({ file_uri: uploadRes.file_uri });
  } catch (error) {
    console.error('PDF generation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});