const dateLabel = value => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

const timeLabel = value => value ? new Date(`2000-01-01T${value}:00`).toLocaleTimeString([], {
  hour: 'numeric', minute: '2-digit'
}) : '';

export async function downloadSchedulePdf(items) {
  if (!items?.length) throw new Error('Add at least one schedule session before downloading the PDF.');

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 44;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  const addHeader = () => {
    pdf.setFillColor(5, 43, 27);
    pdf.rect(0, 0, pageWidth, 112, 'F');
    pdf.setTextColor(220, 246, 147);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text("RENDEZVOUS '26  |  ORGANIZER COPY", margin, 38);
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(24);
    pdf.text('Festival Schedule', margin, 72);
    pdf.setTextColor(206, 224, 213);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(`Generated ${new Date().toLocaleString()}`, margin, 94);
    y = 136;
  };

  const addFooter = () => {
    const pageCount = pdf.internal.getNumberOfPages();
    for (let page = 1; page <= pageCount; page++) {
      pdf.setPage(page);
      pdf.setDrawColor(216, 228, 219);
      pdf.line(margin, pageHeight - 34, pageWidth - margin, pageHeight - 34);
      pdf.setTextColor(105, 122, 111);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.text('Rendezvous 26 · Organizer schedule', margin, pageHeight - 20);
      pdf.text(`${page} / ${pageCount}`, pageWidth - margin, pageHeight - 20, { align: 'right' });
    }
  };

  addHeader();
  const ordered = [...items].sort((a, b) =>
    `${a.schedule_date}T${a.start_time || ''}`.localeCompare(`${b.schedule_date}T${b.start_time || ''}`)
  );

  ordered.forEach((item, index) => {
    const titleLines = pdf.splitTextToSize(String(item.title || 'Untitled session'), contentWidth - 28);
    const detailLines = item.notes ? pdf.splitTextToSize(String(item.notes), contentWidth - 28) : [];
    const meta = [
      [timeLabel(item.start_time), item.end_time ? timeLabel(item.end_time) : ''].filter(Boolean).join(' - '),
      item.venue || ''
    ].filter(Boolean).join('   |   ');
    const cardHeight = 56 + titleLines.length * 18 + (meta ? 18 : 0) + detailLines.length * 13;

    if (y + cardHeight > pageHeight - 54) {
      pdf.addPage();
      addHeader();
    }

    if (index === 0 || item.schedule_date !== ordered[index - 1].schedule_date) {
      if (y > 136) y += 7;
      pdf.setTextColor(17, 92, 54);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text(dateLabel(item.schedule_date), margin, y);
      y += 14;
    }

    pdf.setFillColor(246, 250, 247);
    pdf.setDrawColor(218, 232, 221);
    pdf.roundedRect(margin, y, contentWidth, cardHeight, 7, 7, 'FD');
    pdf.setFillColor(item.published ? 31 : 153, item.published ? 142 : 127, item.published ? 50 : 99);
    pdf.roundedRect(margin, y, 4, cardHeight, 2, 2, 'F');

    let textY = y + 23;
    pdf.setTextColor(25, 48, 34);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text(titleLines, margin + 16, textY);
    textY += titleLines.length * 18;

    if (meta) {
      pdf.setTextColor(76, 99, 83);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text(meta, margin + 16, textY);
      textY += 17;
    }

    if (detailLines.length) {
      pdf.setTextColor(74, 82, 76);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text(detailLines, margin + 16, textY);
    }

    pdf.setTextColor(item.published ? 22 : 110, item.published ? 112 : 110, item.published ? 47 : 110);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text(item.published ? 'PUBLISHED' : 'DRAFT', pageWidth - margin - 14, y + 17, { align: 'right' });
    y += cardHeight + 9;
  });

  addFooter();
  pdf.save('rendezvous-festival-schedule.pdf');
}
