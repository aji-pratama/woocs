/* WooCS Admin JS — minimal helpers */

document.addEventListener('DOMContentLoaded', function () {

    // --- Copy-to-clipboard for API key ----------------------------------------
    document.querySelectorAll('.woocs-copy-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var targetId = this.getAttribute('data-target');
            var input = document.getElementById(targetId);
            if (!input) return;

            var type = input.type;
            input.type = 'text';
            input.select();
            document.execCommand('copy');
            input.type = type;

            var original = this.textContent;
            this.textContent = 'Copied!';
            var self = this;
            setTimeout(function () { self.textContent = original; }, 1500);
        });
    });

});
