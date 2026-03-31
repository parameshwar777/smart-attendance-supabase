interface CollegeHeaderProps {
  showSubtitle?: boolean;
}

export function CollegeHeader({ showSubtitle = true }: CollegeHeaderProps) {
  return (
    <div className="w-full">
      {/* College Banner */}
      <div className="w-full">
        <img
          src="/images/college-header.jpg"
          alt="Potti Sriramulu Chalavadi Mallikarjuna Rao College of Engineering & Technology"
          className="w-full h-auto object-contain"
        />
      </div>
      {/* Dept & App Title */}
      <div className="bg-primary text-primary-foreground py-3 text-center space-y-1">
        <p className="text-xs sm:text-sm font-medium tracking-wide opacity-80">
          Department of CSE-AI &nbsp;|&nbsp; Batch-10
        </p>
        {showSubtitle && (
          <h2 className="text-lg sm:text-xl font-display font-bold tracking-tight">
            AI Attendance System
          </h2>
        )}
      </div>
    </div>
  );
}
