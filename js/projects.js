function detectmob() {
  if (window.innerWidth <= 625) {
    return true;
  } else {
    return false;
  }
}


var image1 = document.getElementById('image1');
var image2 = document.getElementById('image2');
var image3 = document.getElementById('image3');


$('.collapse').on('shown.bs.collapse', function() {
  $(this).parent().find(".glyphicon-plus").removeClass("glyphicon-plus").addClass("glyphicon-minus");
  if (!detectmob()) {
    image3.style.height = '366px';
  }
}).on('hidden.bs.collapse', function() {
  $(this).parent().find(".glyphicon-minus").removeClass("glyphicon-minus").addClass("glyphicon-plus");
  if (!detectmob()) {
    image3.style.height = '200px';
  }
});
