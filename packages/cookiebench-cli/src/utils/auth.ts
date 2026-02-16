/**
 * Check if the user has admin access for database operations
 * This is gated by an admin flag to prevent unauthorized database writes
 */
export function isAdminUser(): boolean {
	// Check for admin flag in environment
	const adminFlag = process.env.CONSENT_ADMIN;

	// Accept 'true', '1', 'yes' as valid values
	return adminFlag === "true" || adminFlag === "1" || adminFlag === "yes";
}
