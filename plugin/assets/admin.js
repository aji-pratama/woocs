document.addEventListener('DOMContentLoaded', function() {
    // Copy to clipboard functionality
    const copyBtns = document.querySelectorAll('.woocs-copy-btn');
    
    copyBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const targetInput = document.getElementById(targetId);
            
            if (targetInput) {
                targetInput.select();
                targetInput.setSelectionRange(0, 99999); /* For mobile devices */
                
                try {
                    document.execCommand('copy');
                    const originalText = this.innerText;
                    this.innerText = 'Copied!';
                    setTimeout(() => {
                        this.innerText = originalText;
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy text: ', err);
                }
            }
        });
    });
});
